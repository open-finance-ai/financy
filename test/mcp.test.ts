import { describe, it, expect, afterEach } from 'vitest'
import { mockApi, seedToken } from './helpers/mock-api.js'
import { connectionsResponse } from './fixtures/connections.js'
import { testConfigDir } from './setup.js'
import { callTool, TOOLS } from '../src/mcp/tools.js'

let teardown: (() => Promise<void>) | undefined

afterEach(async () => {
  await teardown?.()
  teardown = undefined
})

function env() {
  return {
    FINANCY_CLIENT_ID: 'cid',
    FINANCY_CLIENT_SECRET: 'secret',
    FINANCY_USER_ID: 'google-oauth2|1044',
    FINANCY_CONFIG_DIR: testConfigDir(),
  }
}

describe('mcp list_connections tool', () => {
  it('returns the same {data,count,nextPage} envelope the CLI emits', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept({ path: '/v2/connections', method: 'GET' }).reply(200, connectionsResponse)

    const result = await callTool('list_connections', {}, { env: env() })

    expect(result).toEqual({
      data: connectionsResponse.items,
      count: 2,
      nextPage: null,
    })
  })

  it('passes limit and cursor through to the API query, matching the CLI', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    let seenPath = ''
    pool.intercept({ path: /\/v2\/connections/, method: 'GET' }).reply((opts) => {
      seenPath = opts.path
      return { statusCode: 200, data: JSON.stringify(connectionsResponse) }
    })

    await callTool('list_connections', { limit: 5, cursor: 'abc' }, { env: env() })

    expect(seenPath).toContain('limit=5')
    expect(seenPath).toContain('nextPage=abc')
  })
})

describe('mcp tool registry', () => {
  it('exposes exactly the eleven specced verb_noun tools', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(
      [
        'get_account',
        'get_connection',
        'get_status',
        'get_transaction',
        'list_accounts',
        'list_bank_branches',
        'list_categories',
        'list_connections',
        'list_providers',
        'list_transactions',
        'refresh_connections',
      ].sort(),
    )
  })

  it('warns about the 20-credit cost and user confirmation in refresh_connections description', () => {
    const refresh = TOOLS.find((t) => t.name === 'refresh_connections')!
    expect(refresh.description).toMatch(/20 credits/i)
    expect(refresh.description).toMatch(/confirm/i)
  })

  it('gives every tool a non-empty agent-facing description and an object input schema', () => {
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20)
      expect(tool.inputSchema.type).toBe('object')
    }
  })
})

describe('mcp unconfigured state', () => {
  it('returns the structured NOT_CONFIGURED error from every tool', async () => {
    const bareEnv = { FINANCY_CONFIG_DIR: testConfigDir() }
    for (const tool of TOOLS) {
      const result = await callTool(tool.name, {}, { env: bareEnv })
      expect(result).toMatchObject({ error: { code: 'NOT_CONFIGURED' } })
    }
  })
})

describe('mcp get_status tool', () => {
  it('returns the freshness rollup with staleThresholdDays', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept({ path: '/v2/connections', method: 'GET' }).reply(200, connectionsResponse)

    const result = await callTool('get_status', {}, { env: env() })

    expect(result).toEqual({
      staleThresholdDays: 2,
      data: [
        { provider: 'HAPOALIM', status: 'ACTIVE', fresh: '2026-07-22', expires: '2026-10-12', accounts: 3 },
        { provider: 'CAL', status: 'FETCHING_ERROR', fresh: '2026-07-19', expires: '2026-11-03', accounts: 2 },
      ],
    })
  })
})

describe('mcp refresh_connections tool', () => {
  it('returns the refresh result in the {data} envelope', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool
      .intercept({ path: '/chat/chat/connections/refresh', method: 'POST' })
      .reply(200, { status: 'accepted', connections: 2, cost: 20 })

    const result = await callTool('refresh_connections', {}, { env: env() })

    expect(result).toEqual({ data: { status: 'accepted', connections: 2, cost: 20 } })
  })

  it('returns the structured credits error on HTTP 402', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool
      .intercept({ path: '/chat/chat/connections/refresh', method: 'POST' })
      .reply(402, { cost: 20, balance: 6 })

    const result = await callTool('refresh_connections', {}, { env: env() })

    expect(result).toMatchObject({
      error: { code: 'INSUFFICIENT_CREDITS', cost: 20, balance: 6 },
    })
  })
})

describe('mcp get_* tools', () => {
  it('returns NOT_FOUND error envelope when the resource is absent', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept({ path: '/v2/data/accounts/acc_x', method: 'GET' }).reply(404, {})

    const result = await callTool('get_account', { id: 'acc_x' }, { env: env() })

    expect(result).toMatchObject({ error: { code: 'ACCOUNT_NOT_FOUND' } })
  })

  it('returns MISSING_ARGUMENT when id is omitted', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)

    const result = await callTool('get_transaction', {}, { env: env() })

    expect(result).toMatchObject({ error: { code: 'MISSING_ARGUMENT' } })
  })
})

describe('mcp get_transaction is keyed by SK, not by id', () => {
  // A transaction's `id` is a bare ULID; the route is keyed by the composite
  // sort key that list_transactions returns as `SK`.
  const ID = '01M07TQV1M36PXZSVHAHGH30W2'
  const SK = `TRANSACTION#TYPE#CHECKING#PROVIDER#leumi#RESOURCE6dabb2ea-2b7b-4b39-bf16-6dc6ebe3f2ff#${ID}`

  it('names SK as the value to pass, in both the description and the arg', () => {
    const tool = TOOLS.find((t) => t.name === 'get_transaction')!
    const idArg = tool.inputSchema.properties.id as { description?: string }

    expect(tool.description).toMatch(/\bSK\b/)
    expect(idArg.description).toMatch(/\bSK\b/)
  })

  it('rejects a bare id with an actionable error instead of an opaque not-found', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)

    const result = await callTool('get_transaction', { id: ID }, { env: env() })

    expect(result).toMatchObject({ error: { code: 'INVALID_ARGUMENT' } })
    expect((result as { error: { message: string } }).error.message).toMatch(/\bSK\b/)
  })

  it('sends a full SK upstream, percent-encoded', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    let seenPath = ''
    pool.intercept({ path: /\/v2\/data\/transactions\//, method: 'GET' }).reply((opts) => {
      seenPath = opts.path
      return { statusCode: 200, data: JSON.stringify({ id: ID }) }
    })

    const result = await callTool('get_transaction', { id: SK }, { env: env() })

    expect(seenPath).toContain(encodeURIComponent(SK))
    expect(result).toEqual({ data: { id: ID } })
  })
})
