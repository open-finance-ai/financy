import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { Server as HttpServer } from 'node:http'
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose'
import { Agent, MockAgent, setGlobalDispatcher } from 'undici'
import { connectionsResponse } from './fixtures/connections.js'
import { startRemoteServer, METADATA_PATH } from '../src/remote/server.js'

const AUTH0_DOMAIN = 'stg-tenant.us.auth0.com'
const ISSUER = `https://${AUTH0_DOMAIN}/`
const AUDIENCE = 'https://mcp.open-finance.ai'
const API_ORIGIN = 'https://api.open-finance.ai'

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

let httpServer: HttpServer
let baseUrl: string
let signKey: SigningKey
let wrongKey: SigningKey
let agent: MockAgent | undefined
let pool: ReturnType<MockAgent['get']>

async function mintJwt(key: SigningKey, overrides: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({ scope: 'mcp:read offline_access', ...overrides })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(String(overrides.iss ?? ISSUER))
    .setAudience(String(overrides.aud ?? AUDIENCE))
    .setExpirationTime('1h')
    .sign(key)
}

async function rpc(body: unknown, token?: string): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

const listToolsRequest = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  signKey = pair.privateKey
  wrongKey = (await generateKeyPair('RS256')).privateKey
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'RS256' }] })

  httpServer = await startRemoteServer(
    { FINANCY_MCP_AUTH0_DOMAIN: AUTH0_DOMAIN, FINANCY_MCP_AUDIENCE: AUDIENCE },
    0,
    { getKey: jwks },
  )
  const address = httpServer.address()
  if (typeof address !== 'object' || !address) throw new Error('no address')
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve))
})

afterEach(async () => {
  if (agent) {
    await agent.close()
    agent = undefined
    setGlobalDispatcher(new Agent())
  }
})

function mockUpstreamApi(): void {
  agent = new MockAgent()
  agent.disableNetConnect()
  agent.enableNetConnect(/127\.0\.0\.1/)
  setGlobalDispatcher(agent)
  pool = agent.get(API_ORIGIN)
}

describe('protected resource metadata', () => {
  it('serves RFC 9728 metadata without authentication', async () => {
    const res = await fetch(baseUrl + METADATA_PATH)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      resource: AUDIENCE,
      authorization_servers: [ISSUER],
      scopes_supported: ['mcp:read'],
      bearer_methods_supported: ['header'],
    })
  })
})

describe('authentication boundary', () => {
  it('401s without a token and points at the resource metadata', async () => {
    const res = await rpc(listToolsRequest)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain(`resource_metadata=`)
    expect(res.headers.get('www-authenticate')).toContain(METADATA_PATH)
  })

  it('401s a token signed by the wrong key', async () => {
    const res = await rpc(listToolsRequest, await mintJwt(wrongKey))
    expect(res.status).toBe(401)
  })

  it('401s a token for the wrong audience', async () => {
    const res = await rpc(listToolsRequest, await mintJwt(signKey, { aud: 'https://other.example' }))
    expect(res.status).toBe(401)
  })

  it('401s a token missing the mcp:read scope', async () => {
    const res = await rpc(listToolsRequest, await mintJwt(signKey, { scope: 'openid' }))
    expect(res.status).toBe(401)
    expect(((await res.json()) as { message: string }).message).toContain('mcp:read')
  })

  it('401s a signed token that has no exp claim', async () => {
    const noExp = await new SignJWT({ scope: 'mcp:read' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .sign(signKey)
    const res = await rpc(listToolsRequest, noExp)
    expect(res.status).toBe(401)
  })
})

describe('request hardening', () => {
  it('405s a GET on the MCP path (no idle SSE streams)', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'GET',
      headers: { authorization: `Bearer ${await mintJwt(signKey)}` },
    })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })

  it('400s a JSON-RPC batch (array body) rather than fanning out', async () => {
    const token = await mintJwt(signKey)
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify([listToolsRequest, listToolsRequest, listToolsRequest]),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('batch_not_supported')
  })

  it('413s an oversized body', async () => {
    const token = await mintJwt(signKey)
    const huge = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'x'.repeat(300 * 1024) } }
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(huge),
    })
    expect(res.status).toBe(413)
  })
})

describe('tools over streamable http', () => {
  it('lists the read tools and excludes refresh_connections', async () => {
    const res = await rpc(listToolsRequest, await mintJwt(signKey))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: { tools: { name: string }[] } }
    const names = body.result.tools.map((tool) => tool.name)
    expect(names).toContain('list_connections')
    expect(names).toContain('list_transactions')
    expect(names).not.toContain('refresh_connections')
  })

  it('forwards the caller bearer verbatim on tools/call', async () => {
    mockUpstreamApi()
    const token = await mintJwt(signKey)
    let seenAuth = ''
    pool.intercept({ path: '/v2/connections', method: 'GET' }).reply((opts) => {
      seenAuth = JSON.stringify(opts.headers)
      return { statusCode: 200, data: JSON.stringify(connectionsResponse) }
    })

    const res = await rpc(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'list_connections', arguments: {} },
      },
      token,
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: { content: { text: string }[] } }
    const envelope = JSON.parse(body.result.content[0]?.text ?? '{}') as { count: number }
    expect(seenAuth).toContain(`Bearer ${token}`)
    expect(envelope.count).toBe(2)
  })

  it('rejects a tools/call for refresh_connections with UNKNOWN_TOOL', async () => {
    const res = await rpc(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'refresh_connections', arguments: {} },
      },
      await mintJwt(signKey),
    )
    const body = (await res.json()) as { result: { content: { text: string }[] } }
    const envelope = JSON.parse(body.result.content[0]?.text ?? '{}') as { error: { code: string } }
    expect(envelope.error.code).toBe('UNKNOWN_TOOL')
  })
})
