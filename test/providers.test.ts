import { describe, it, expect, afterEach } from 'vitest'
import { mockApi, seedToken } from './helpers/mock-api.js'
import { runCli } from './helpers/run-cli.js'

const ENV = {
  FINANCY_CLIENT_ID: 'cid',
  FINANCY_CLIENT_SECRET: 'secret',
  FINANCY_USER_ID: 'uid',
}

let teardown: (() => Promise<void>) | undefined
afterEach(async () => {
  await teardown?.()
  teardown = undefined
})

describe('financy providers list', () => {
  it('emits the envelope under --json', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    // Real /providers returns a bare ARRAY of objects keyed by providerFriendlyId.
    pool.intercept({ path: '/v2/providers', method: 'GET' }).reply(200, [
      { providerFriendlyId: 'hapoalim', name: 'Hapoalim', nameNativeLanguage: 'בנק הפועלים', mode: 'PSD2' },
      { providerFriendlyId: 'cal', name: 'Cal', nameNativeLanguage: 'כאל', mode: 'PSD2' },
    ])

    const { code, stdout } = await runCli(['providers', 'list', '--json'], { env: ENV })

    expect(code).toBe(0)
    expect(JSON.parse(stdout).data.map((p: { providerFriendlyId: string }) => p.providerFriendlyId)).toEqual([
      'hapoalim',
      'cal',
    ])
  })

  it('pads columns by display width so a combining mark does not misalign the next column', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    // 'שלום' + combining holam (U+05B9): length 5, display width 4.
    const hebrew = 'שלוםֹ'
    pool.intercept({ path: '/v2/providers', method: 'GET' }).reply(200, [
      { providerFriendlyId: 'AA', name: hebrew, mode: 'PSD2' },
      { providerFriendlyId: 'BB', name: 'Netflix', mode: 'OB' },
    ])

    const { code, stdout } = await runCli(['providers', 'list'], { env: ENV })

    expect(code).toBe(0)
    const row = stdout.split('\n').find((l) => l.includes('שלוםֹ'))!
    // NAME column width is 7 ('Netflix'); the width-4 Hebrew cell → 3 padding + 2 gap = 5 spaces
    // before the next column. A String.length pad would emit only 4, misaligning it.
    expect(row).toMatch(/שלוםֹ {5}\S/)
  })
})

describe('financy providers branches', () => {
  it('sends no paging params (the endpoint rejects limit) and renders a bare array', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    let requestPath = ''
    pool.intercept({ path: (p) => p.startsWith('/v2/bank-branches'), method: 'GET' }).reply((opts) => {
      requestPath = opts.path as string
      return { statusCode: 200, data: JSON.stringify([]) } // real endpoint returns a bare array
    })

    const { code, stdout } = await runCli(['providers', 'branches', '--json'], { env: ENV })

    expect(code).toBe(0)
    expect(requestPath).not.toContain('limit')
    expect(requestPath).not.toContain('nextPage')
    expect(JSON.parse(stdout)).toEqual({ data: [], count: 0, nextPage: null })
  })
})

describe('403 mapping', () => {
  it('maps a non-plan 403 to FORBIDDEN (not a misleading upgrade nag)', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool
      .intercept({ path: '/v2/data/transaction-categories', method: 'GET' })
      .reply(403, { message: 'Forbidden' })

    const { code, stderr } = await runCli(['categories', '--json'], { env: ENV })

    expect(code).toBe(4)
    const payload = JSON.parse(stderr)
    expect(payload.error.code).toBe('FORBIDDEN')
    expect(payload.error.message).not.toMatch(/upgrade/i)
  })

  it('still maps the plan gate (NOT_AVAILABLE_ON_PLAN) to the upgrade message', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool
      .intercept({ path: '/v2/providers', method: 'GET' })
      .reply(403, { message: 'NOT_AVAILABLE_ON_PLAN' })

    const { code, stderr } = await runCli(['providers', 'list', '--json'], { env: ENV })

    expect(code).toBe(4)
    expect(JSON.parse(stderr).error.code).toBe('NOT_AVAILABLE_ON_PLAN')
  })
})

describe('financy categories', () => {
  it('emits {data} under --json and pretty JSON by default', async () => {
    const taxonomy = [{ main: 'Groceries', he: 'מזון וסופר', subs: ['Supermarket'] }]

    const first = mockApi()
    teardown = first.close
    seedToken(first.pool)
    first.pool
      .intercept({ path: '/v2/data/transaction-categories', method: 'GET' })
      .reply(200, taxonomy)

    const jsonRun = await runCli(['categories', '--json'], { env: ENV })
    expect(jsonRun.code).toBe(0)
    expect(JSON.parse(jsonRun.stdout).data).toEqual(taxonomy)
    await first.close()

    const second = mockApi()
    teardown = second.close
    seedToken(second.pool)
    second.pool
      .intercept({ path: '/v2/data/transaction-categories', method: 'GET' })
      .reply(200, taxonomy)

    const humanRun = await runCli(['categories'], { env: ENV })
    expect(humanRun.code).toBe(0)
    expect(JSON.parse(humanRun.stdout)).toEqual(taxonomy)
  })
})
