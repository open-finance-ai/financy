import { describe, it, expect, afterEach } from 'vitest'
import { mockApi } from './helpers/mock-api.js'
import { connectionsResponse } from './fixtures/connections.js'
import { testConfigDir } from './setup.js'
import { bearerConfig } from '../src/config.js'
import { callTool } from '../src/mcp/tools.js'

let teardown: (() => Promise<void>) | undefined

afterEach(async () => {
  await teardown?.()
  teardown = undefined
})

const CALLER_TOKEN = 'caller-held-oauth-token'

describe('bearer passthrough (remote MCP server auth mode)', () => {
  it('forwards exactly the caller-held token, without minting or config', async () => {
    const { pool, close } = mockApi()
    teardown = close
    let seenAuth = ''
    pool.intercept({ path: '/v2/connections', method: 'GET' }).reply((opts) => {
      seenAuth = JSON.stringify(opts.headers)
      return { statusCode: 200, data: JSON.stringify(connectionsResponse) }
    })

    const result = await callTool(
      'list_connections',
      {},
      { env: {}, config: bearerConfig({}, CALLER_TOKEN) },
    )

    expect(seenAuth).toContain(`Bearer ${CALLER_TOKEN}`)
    expect(result).toEqual({
      data: connectionsResponse.items,
      count: 2,
      nextPage: null,
    })
  })

  it('surfaces a 401 as AUTH_FAILED without attempting a re-mint', async () => {
    const { pool, close } = mockApi()
    teardown = close
    pool.intercept({ path: '/v2/connections', method: 'GET' }).reply(401, {})

    const result = (await callTool(
      'list_connections',
      {},
      { env: {}, config: bearerConfig({}, CALLER_TOKEN) },
    )) as { error?: { code?: string } }

    expect(result.error?.code).toBe('AUTH_FAILED')
  })

  it('keeps the config-resolution path for callers without a pre-resolved config', async () => {
    const result = (await callTool(
      'list_connections',
      {},
      { env: { FINANCY_CONFIG_DIR: testConfigDir() } },
    )) as {
      error?: { code?: string }
    }

    expect(result.error?.code).toBe('NOT_CONFIGURED')
  })
})
