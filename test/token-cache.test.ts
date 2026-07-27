import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, statSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockApi } from './helpers/mock-api.js'
import { makeJwt } from './helpers/jwt.js'
import { connectionsResponse } from './fixtures/connections.js'
import { runCli } from './helpers/run-cli.js'

const CREDS = {
  FINANCY_CLIENT_ID: 'cid',
  FINANCY_CLIENT_SECRET: 'secret',
  FINANCY_USER_ID: 'google-oauth2|1044',
}
const NOW = new Date('2026-07-23T12:00:00Z')
const farFutureExp = Math.floor(Date.parse('2099-01-01') / 1000)

let teardown: (() => Promise<void>) | undefined
let configDir: string

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'financy-'))
})
afterEach(async () => {
  await teardown?.()
  teardown = undefined
  rmSync(configDir, { recursive: true, force: true })
})

describe('token cache', () => {
  const env = () => ({ ...CREDS, FINANCY_CONFIG_DIR: configDir })

  it('mints the token once and reuses the cache on the next invocation', async () => {
    const { agent, pool, close } = mockApi()
    teardown = close

    // The token endpoint answers exactly once; a second mint would 404 the mock.
    pool.intercept({ path: '/oauth/token', method: 'POST' }).reply(200, {
      accessToken: makeJwt({ exp: farFutureExp }),
      tokenType: 'Bearer',
      expiresIn: 86400,
    })
    pool
      .intercept({ path: '/v2/connections', method: 'GET' })
      .reply(200, connectionsResponse)
      .times(2)

    const first = await runCli(['status', '--json'], { env: env(), now: NOW })
    const second = await runCli(['status', '--json'], { env: env(), now: NOW })

    expect(first.code).toBe(0)
    expect(second.code).toBe(0)
    // Every registered interceptor consumed: token exactly once, both connection reads made.
    agent.assertNoPendingInterceptors()

    // Token cached beside config with owner-only permissions.
    const tokenFile = join(configDir, 'token.json')
    expect(existsSync(tokenFile)).toBe(true)
    expect(statSync(tokenFile).mode & 0o777).toBe(0o600)
  })

  it('re-mints when the cached token has already expired', async () => {
    const expiredExp = Math.floor(Date.parse('2020-01-01') / 1000)
    writeFileSync(
      join(configDir, 'token.json'),
      JSON.stringify({ access_token_note: 'stale', accessToken: makeJwt({ exp: expiredExp }), exp: expiredExp }),
      { mode: 0o600 },
    )

    const { agent, pool, close } = mockApi()
    teardown = close
    pool.intercept({ path: '/oauth/token', method: 'POST' }).reply(200, {
      accessToken: makeJwt({ exp: farFutureExp }),
      tokenType: 'Bearer',
      expiresIn: 86400,
    })
    pool
      .intercept({ path: '/v2/connections', method: 'GET' })
      .reply(200, connectionsResponse)

    const { code, stderr } = await runCli(['status', '--json'], { env: env(), now: NOW })

    expect(stderr).toBe('')
    expect(code).toBe(0)
    // The token endpoint was hit → the expired cache was not reused.
    agent.assertNoPendingInterceptors()
  })
})
