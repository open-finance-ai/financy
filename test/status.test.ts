import { describe, it, expect, afterEach } from 'vitest'
import { mockApi, seedToken } from './helpers/mock-api.js'
import { makeJwt } from './helpers/jwt.js'
import { connectionsResponse } from './fixtures/connections.js'
import { runCli } from './helpers/run-cli.js'
import pkg from '../package.json' with { type: 'json' }

const ENV = {
  FINANCY_CLIENT_ID: 'cid',
  FINANCY_CLIENT_SECRET: 'secret',
  FINANCY_USER_ID: 'google-oauth2|1044',
}

let teardown: (() => Promise<void>) | undefined

afterEach(async () => {
  await teardown?.()
  teardown = undefined
})

describe('financy status --json', () => {
  it('mints a token, reads connections, and emits the {data, staleThresholdDays} envelope', async () => {
    const { pool, close } = mockApi()
    teardown = close

    pool
      .intercept({ path: '/oauth/token', method: 'POST' })
      .reply(200, {
        accessToken: makeJwt({ exp: Math.floor(Date.parse('2099-01-01') / 1000) }),
        tokenType: 'Bearer',
        expiresIn: 86400,
      })
    pool
      .intercept({ path: '/v2/connections', method: 'GET' })
      .reply(200, connectionsResponse)

    const { code, stdout, stderr } = await runCli(['status', '--json'], { env: ENV })

    expect(stderr).toBe('')
    expect(code).toBe(0)

    const payload = JSON.parse(stdout)
    expect(payload.staleThresholdDays).toBe(2)
    expect(payload.data).toEqual([
      {
        provider: 'HAPOALIM',
        status: 'ACTIVE',
        fresh: '2026-07-22',
        expires: '2026-10-12',
        accounts: 3,
      },
      {
        provider: 'CAL',
        status: 'FETCHING_ERROR',
        fresh: '2026-07-19',
        expires: '2026-11-03',
        accounts: 2,
      },
    ])
  })

  it('exits 3 (auth) with a JSON error on stderr when the token endpoint rejects the credentials', async () => {
    const { pool, close } = mockApi()
    teardown = close

    pool
      .intercept({ path: '/oauth/token', method: 'POST' })
      .reply(401, { error: 'access_denied', error_description: 'invalid client' })

    const { code, stdout, stderr } = await runCli(['status', '--json'], { env: ENV })

    expect(code).toBe(3)
    expect(stdout).toBe('')
    const payload = JSON.parse(stderr)
    expect(payload.error.code).toBe('AUTH_FAILED')
    expect(payload.error.message).toBeTruthy()
  })

  it('re-mints the token and retries once when the API returns 401', async () => {
    const { pool, close } = mockApi()
    teardown = close

    const freshToken = () =>
      makeJwt({ exp: Math.floor(Date.parse('2099-01-01') / 1000) })

    pool
      .intercept({ path: '/oauth/token', method: 'POST' })
      .reply(200, { accessToken: freshToken(), tokenType: 'Bearer', expiresIn: 86400 })
      .times(2)
    // First data call rejects the (assumed stale) token; second, after re-mint, succeeds.
    pool.intercept({ path: '/v2/connections', method: 'GET' }).reply(401, {})
    pool
      .intercept({ path: '/v2/connections', method: 'GET' })
      .reply(200, connectionsResponse)

    const { code, stdout, stderr } = await runCli(['status', '--json'], { env: ENV })

    expect(stderr).toBe('')
    expect(code).toBe(0)
    expect(JSON.parse(stdout).data).toHaveLength(2)
  })

  it('exits 4 (plan) with a JSON error when the API 403s a free plan', async () => {
    const { pool, close } = mockApi()
    teardown = close

    pool
      .intercept({ path: '/oauth/token', method: 'POST' })
      .reply(200, {
        accessToken: makeJwt({ exp: Math.floor(Date.parse('2099-01-01') / 1000) }),
        tokenType: 'Bearer',
        expiresIn: 86400,
      })
    pool
      .intercept({ path: '/v2/connections', method: 'GET' })
      .reply(403, { message: 'NOT_AVAILABLE_ON_PLAN' })

    const { code, stdout, stderr } = await runCli(['status', '--json'], { env: ENV })

    expect(code).toBe(4)
    expect(stdout).toBe('')
    const payload = JSON.parse(stderr)
    expect(payload.error.code).toBe('NOT_AVAILABLE_ON_PLAN')
  })

  it('exits 7 (api-unavailable) with a JSON error when the network fails', async () => {
    const { pool, close } = mockApi()
    teardown = close

    pool
      .intercept({ path: '/oauth/token', method: 'POST' })
      .replyWithError(new Error('ECONNREFUSED'))

    const { code, stdout, stderr } = await runCli(['status', '--json'], { env: ENV })

    expect(code).toBe(7)
    expect(stdout).toBe('')
    const payload = JSON.parse(stderr)
    expect(payload.error.code).toBe('API_UNAVAILABLE')
  })

  it('stamps User-Agent: financy-cli/<version> on the token and API requests', async () => {
    const { pool, close } = mockApi()
    teardown = close

    const seen: { token?: string; connections?: string } = {}
    pool.intercept({ path: '/oauth/token', method: 'POST' }).reply((opts) => {
      seen.token = (opts.headers as Record<string, string>)['user-agent']
      return {
        statusCode: 200,
        data: JSON.stringify({
          accessToken: makeJwt({ exp: Math.floor(Date.parse('2099-01-01') / 1000) }),
          tokenType: 'Bearer',
          expiresIn: 86400,
        }),
      }
    })
    pool.intercept({ path: '/v2/connections', method: 'GET' }).reply((opts) => {
      seen.connections = (opts.headers as Record<string, string>)['user-agent']
      return { statusCode: 200, data: JSON.stringify(connectionsResponse) }
    })

    const { code } = await runCli(['status', '--json'], { env: ENV })

    expect(code).toBe(0)
    expect(seen.token).toBe(`financy-cli/${pkg.version}`)
    expect(seen.connections).toBe(`financy-cli/${pkg.version}`)
  })
})

describe('financy status (human table)', () => {
  function mockHappyPath() {
    const { pool, close } = mockApi()
    teardown = close
    pool
      .intercept({ path: '/oauth/token', method: 'POST' })
      .reply(200, {
        accessToken: makeJwt({ exp: Math.floor(Date.parse('2099-01-01') / 1000) }),
        tokenType: 'Bearer',
        expiresIn: 86400,
      })
    pool
      .intercept({ path: '/v2/connections', method: 'GET' })
      .reply(200, connectionsResponse)
  }

  it('renders the per-connection freshness rollup against today', async () => {
    mockHappyPath()

    const { code, stdout, stderr } = await runCli(['status'], {
      env: ENV,
      now: new Date('2026-07-23T12:00:00Z'),
    })

    expect(code).toBe(0)
    expect(stderr).toBe('')

    // HAPOALIM: data through 2026-07-22 → 1 day ago → fresh
    expect(stdout).toContain('HAPOALIM')
    expect(stdout).toMatch(/fresh/i)
    expect(stdout).toContain('2026-07-22')
    expect(stdout).toContain('1d ago')
    expect(stdout).toContain('2026-10-12')

    // CAL: FETCHING_ERROR → flagged with the provider error detail
    expect(stdout).toContain('CAL')
    expect(stdout).toContain('FETCHING_ERROR')
    expect(stdout).toContain('2026-07-19')
    expect(stdout).toContain('4d ago')
    expect(stdout).toContain('PROVIDER_TIMEOUT')

    // one connection needs attention → refresh nudge with the credit cost
    expect(stdout).toMatch(/financy refresh/)
    expect(stdout).toContain('20 credits')
  })

  // Real /connections objects (2026-07-24): inactive/expired connections omit
  // providerId, the per-type counts, and any data-freshness date entirely.
  const realShapeConnections = {
    items: [
      {
        id: '01KKE70D57DNJV2H90K1B1919Y',
        userId: 'test@example.com',
        status: 'INACTIVE',
        mode: 'PSD2',
        startDate: '2025-03-11',
        expiryDate: '2029-03-11',
        providerIds: [],
        updatedAt: '2026-03-11T10:27:46.983Z',
      },
      {
        id: '01KCGN185ZCAJ4JMMMJNQ7YZTA',
        userId: 'test@example.com',
        providerId: 'otsarHahayal',
        status: 'EXPIRED',
        accounts: 0,
        cards: 0,
        savings: 0,
        loans: 0,
        securities: 0,
        transactions: 0,
        expiryDate: '2028-12-15',
        updatedAt: '2025-12-15T09:21:30.815Z',
      },
    ],
    nextPage: null,
    count: 2,
  }

  it('renders without crashing when connections have no data-fetched date (human)', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept({ path: '/v2/connections', method: 'GET' }).reply(200, realShapeConnections)

    const { code, stdout, stderr } = await runCli(['status'], { env: ENV })

    expect(stderr).toBe('')
    expect(code).toBe(0)
    expect(stdout).toContain('INACTIVE')
    expect(stdout).toContain('EXPIRED')
    expect(stdout).toContain('no data fetched yet')
    expect(stdout).toContain('(pending)') // the connection with no providerId
  })

  it('emits null fresh dates (not a crash) for undated connections under --json', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept({ path: '/v2/connections', method: 'GET' }).reply(200, realShapeConnections)

    const { code, stdout } = await runCli(['status', '--json'], { env: ENV })

    expect(code).toBe(0)
    const payload = JSON.parse(stdout)
    expect(payload.data[0]).toEqual({
      provider: null,
      status: 'INACTIVE',
      fresh: null,
      expires: '2029-03-11',
      accounts: 0,
    })
    expect(payload.data[1].provider).toBe('otsarHahayal')
  })
})
