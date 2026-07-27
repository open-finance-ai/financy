import { describe, it, expect, afterEach } from 'vitest'
import { mockApi, seedToken } from './helpers/mock-api.js'
import { runCli } from './helpers/run-cli.js'

const ENV = {
  FINANCY_CLIENT_ID: 'cid',
  FINANCY_CLIENT_SECRET: 'secret',
  FINANCY_USER_ID: 'uid',
}
const ACCOUNTS_PATH = '/v2/data/accounts'

// Real /data/accounts shape (2026-07-24): name is `product`, and balances are a
// typed list whose money is `balanceAmount.amount` — often a STRING.
const ACCOUNTS = [
  {
    id: 'acc_9f2e01',
    accountType: 'CHECKING',
    product: 'עו"ש',
    providerId: 'HAPOALIM',
    currency: 'ILS',
    balances: [
      { balanceType: 'closingBooked', balanceAmount: { currency: 'ILS', amount: '18432.55' } },
      { balanceType: 'interimAvailable', balanceAmount: { currency: 'ILS', amount: '5000' } },
    ],
  },
  {
    id: 'acc_3ab774',
    accountType: 'CARD',
    product: 'Visa CAL ****4412',
    providerId: 'CAL',
    currency: 'ILS',
    balances: [
      { balanceType: 'closingBooked', balanceAmount: { currency: 'ILS', amount: -6210.9 } },
    ],
  },
]

let teardown: (() => Promise<void>) | undefined
afterEach(async () => {
  await teardown?.()
  teardown = undefined
})

describe('financy accounts list', () => {
  it('maps --type to accountType (uppercased) and --connection to connectionId', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    let requestPath = ''
    pool
      .intercept({ path: (p) => p.startsWith(ACCOUNTS_PATH), method: 'GET' })
      .reply((opts) => {
        requestPath = opts.path as string
        return { statusCode: 200, data: JSON.stringify({ items: ACCOUNTS, nextPage: null, count: 2 }) }
      })

    const { code, stdout } = await runCli(
      ['accounts', 'list', '--type', 'card', '--connection', 'conn_1', '--json'],
      { env: ENV },
    )

    expect(code).toBe(0)
    const q = new URLSearchParams(requestPath.split('?')[1])
    expect(q.get('accountType')).toBe('CARD')
    expect(q.get('connectionId')).toBe('conn_1')
    expect(JSON.parse(stdout).count).toBe(2)
  })

  it('renders a table with ₪-formatted balances by default', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool
      .intercept({ path: (p) => p.startsWith(ACCOUNTS_PATH), method: 'GET' })
      .reply(200, { items: ACCOUNTS, nextPage: null, count: 2 })

    const { code, stdout } = await runCli(['accounts', 'list'], { env: ENV })

    expect(code).toBe(0)
    expect(stdout).toContain('BALANCE')
    expect(stdout).toContain('₪18,432.55') // closingBooked, from a string amount
    expect(stdout).toContain('-₪6,210.90')
    expect(stdout).toContain('עו"ש') // NAME comes from `product`
    expect(stdout).not.toContain('NaN')
  })
})

describe('financy accounts get', () => {
  it('exits 6 when the API returns an empty object', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool
      .intercept({ path: (p) => p.startsWith(`${ACCOUNTS_PATH}/`), method: 'GET' })
      .reply(200, {})

    const { code, stderr } = await runCli(['accounts', 'get', 'acc_missing', '--json'], {
      env: ENV,
    })

    expect(code).toBe(6)
    expect(JSON.parse(stderr).error.code).toBe('ACCOUNT_NOT_FOUND')
  })
})
