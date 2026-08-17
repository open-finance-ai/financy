import { describe, it, expect, beforeAll } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose'
import { createLambdaHandler, type FunctionUrlEvent, type FunctionUrlResult } from '../src/remote/lambda.js'
import { METADATA_PATH } from '../src/remote/server.js'

const AUTH0_DOMAIN = 'stg-tenant.us.auth0.com'
const AUDIENCE = 'https://mcp-stg.open-finance.ai'

let handler: (event: FunctionUrlEvent) => Promise<FunctionUrlResult>
let token: string

function event(overrides: Partial<FunctionUrlEvent> & { method?: string } = {}): FunctionUrlEvent {
  const { method, ...rest } = overrides
  return {
    rawPath: '/mcp',
    headers: { host: 'abc.lambda-url.eu-west-1.on.aws' },
    requestContext: { http: { method: method ?? 'POST' } },
    ...rest,
  }
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'RS256' }] })
  token = await new SignJWT({ scope: 'mcp:read' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(`https://${AUTH0_DOMAIN}/`)
    .setAudience(AUDIENCE)
    .setExpirationTime('1h')
    .sign(pair.privateKey)

  handler = createLambdaHandler(
    { FINANCY_MCP_AUTH0_DOMAIN: AUTH0_DOMAIN, FINANCY_MCP_AUDIENCE: AUDIENCE },
    { getKey: jwks },
  )
})

describe('lambda adapter', () => {
  it('serves protected-resource metadata', async () => {
    const res = await handler(event({ rawPath: METADATA_PATH, method: 'GET' }))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/json')
    expect(JSON.parse(res.body)).toMatchObject({ resource: AUDIENCE })
  })

  it('401s an unauthenticated /mcp call with a metadata hint on the public domain', async () => {
    const res = await handler(event({
      headers: {
        host: 'abc.lambda-url.eu-west-1.on.aws',
        'x-forwarded-host': 'mcp-stg.open-finance.ai',
        'x-forwarded-proto': 'https',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }))
    expect(res.statusCode).toBe(401)
    expect(res.headers['www-authenticate'])
      .toBe(`Bearer resource_metadata="https://mcp-stg.open-finance.ai${METADATA_PATH}"`)
  })

  it('falls back to the event host for the metadata hint when x-forwarded-host is absent', async () => {
    const res = await handler(event({
      headers: {
        host: 'abc.lambda-url.eu-west-1.on.aws',
        'x-forwarded-proto': 'https',
        'content-type': 'application/json',
      },
      body: '{}',
    }))
    expect(res.statusCode).toBe(401)
    expect(res.headers['www-authenticate'])
      .toBe(`Bearer resource_metadata="https://abc.lambda-url.eu-west-1.on.aws${METADATA_PATH}"`)
  })

  it('decodes base64 bodies before the server parses them', async () => {
    const res = await handler(event({
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: Buffer.from('[]').toString('base64'),
      isBase64Encoded: true,
    }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('batch_not_supported')
  })

  it('completes tools/list end-to-end through the adapter', async () => {
    const res = await handler(event({
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }))
    expect(res.statusCode).toBe(200)
    const parsed = JSON.parse(res.body)
    const names = parsed.result.tools.map((tool: { name: string }) => tool.name)
    expect(names).toContain('list_connections')
    expect(names).not.toContain('refresh_connections')
  })

  it('404s unknown paths', async () => {
    const res = await handler(event({ rawPath: '/nope', method: 'GET' }))
    expect(res.statusCode).toBe(404)
  })
})
