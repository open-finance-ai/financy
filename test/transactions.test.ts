import { describe, it, expect, afterEach } from 'vitest'
import { mockApi, seedToken } from './helpers/mock-api.js'
import { runCli } from './helpers/run-cli.js'

const ENV = {
  FINANCY_CLIENT_ID: 'cid',
  FINANCY_CLIENT_SECRET: 'secret',
  FINANCY_USER_ID: 'uid',
}
const TXN_PATH = '/v2/data/transactions'

let teardown: (() => Promise<void>) | undefined
afterEach(async () => {
  await teardown?.()
  teardown = undefined
})

describe('financy transactions list', () => {
  it('maps every filter to the matching API query param (--type uppercased)', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    let requestPath = ''
    pool
      .intercept({ path: (p) => p.startsWith(TXN_PATH), method: 'GET' })
      .reply((opts) => {
        requestPath = opts.path as string
        return { statusCode: 200, data: JSON.stringify({ items: [], nextPage: null, count: 0 }) }
      })

    const { code } = await runCli(
      [
        'transactions', 'list',
        '--from', '2026-07-01',
        '--to', '2026-07-23',
        '--account', 'acc_1',
        '--connection', 'conn_1',
        '--type', 'card',
        '--limit', '50',
        '--json',
      ],
      { env: ENV },
    )

    expect(code).toBe(0)
    const q = new URLSearchParams(requestPath.split('?')[1])
    expect(q.get('dateFrom')).toBe('2026-07-01')
    expect(q.get('dateTo')).toBe('2026-07-23')
    expect(q.get('accountId')).toBe('acc_1')
    expect(q.get('connectionId')).toBe('conn_1')
    expect(q.get('type')).toBe('CARD')
    expect(q.get('limit')).toBe('50')
  })

  it('renders the nested charged/original amount and merchant name in the table', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    // Real shape: money is amount.{charged,original}.amount; charged can be "".
    const txn = {
      id: 'txn_1',
      type: 'CARD',
      merchantName: 'דמי כרטיס',
      description: { description: 'דמי כרטיס /הנפקה' },
      amount: {
        originalAmount: { amount: -17.9, currency: 'ILS' },
        chargedAmount: { amount: '', currency: 'ILS' },
      },
      category: { main: 'SHOPPING', sub: 'SHOPPING_OTHER' },
      date: { transactionDate: '2026-07-22' },
    }
    pool
      .intercept({ path: (p) => p.startsWith(TXN_PATH), method: 'GET' })
      .reply(200, { items: [txn], nextPage: null, count: 1 })

    const { code, stdout } = await runCli(['transactions', 'list'], { env: ENV })

    expect(code).toBe(0)
    expect(stdout).toContain('-₪17.90') // empty charged → falls back to original
    expect(stdout).toContain('דמי כרטיס')
    expect(stdout).toContain('SHOPPING/SHOPPING_OTHER')
    expect(stdout).not.toContain('NaN')
    expect(stdout).not.toContain('[object Object]')
  })

  it('--all follows nextPage cursors to exhaustion', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool
      .intercept({ path: TXN_PATH, method: 'GET' })
      .reply(200, { items: [{ id: 'txn_A' }], nextPage: 'CUR2', count: 1 })
    pool
      .intercept({ path: `${TXN_PATH}?nextPage=CUR2`, method: 'GET' })
      .reply(200, { items: [{ id: 'txn_B' }], nextPage: null, count: 1 })

    const { code, stdout } = await runCli(['transactions', 'list', '--all', '--json'], {
      env: ENV,
    })

    expect(code).toBe(0)
    const payload = JSON.parse(stdout)
    expect(payload.count).toBe(2)
    expect(payload.nextPage).toBeNull()
    expect(payload.data.map((t: { id: string }) => t.id)).toEqual(['txn_A', 'txn_B'])
  })

  it('--cursor resumes from a mid-stream cursor', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    let requestPath = ''
    pool
      .intercept({ path: (p) => p.startsWith(TXN_PATH), method: 'GET' })
      .reply((opts) => {
        requestPath = opts.path as string
        return { statusCode: 200, data: JSON.stringify({ items: [{ id: 'txn_B' }], nextPage: null, count: 1 }) }
      })

    const { code, stdout } = await runCli(
      ['transactions', 'list', '--cursor', 'CUR2', '--json'],
      { env: ENV },
    )

    expect(code).toBe(0)
    expect(new URLSearchParams(requestPath.split('?')[1]).get('nextPage')).toBe('CUR2')
    expect(JSON.parse(stdout).data).toEqual([{ id: 'txn_B' }])
  })
})

describe('financy transactions get', () => {
  it('exits 6 when the API returns an empty object (not-found convention)', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool
      .intercept({ path: (p) => p.startsWith(`${TXN_PATH}/`), method: 'GET' })
      .reply(200, {})

    const { code, stdout, stderr } = await runCli(
      ['transactions', 'get', 'txn_missing', '--json'],
      { env: ENV },
    )

    expect(code).toBe(6)
    expect(stdout).toBe('')
    expect(JSON.parse(stderr).error.code).toBe('TRANSACTION_NOT_FOUND')
  })
})
