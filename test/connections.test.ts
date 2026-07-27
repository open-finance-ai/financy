import { describe, it, expect, afterEach } from 'vitest'
import { mockApi } from './helpers/mock-api.js'
import { makeJwt } from './helpers/jwt.js'
import { connectionsResponse } from './fixtures/connections.js'
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

function mockToken(pool: ReturnType<typeof mockApi>['pool']) {
  pool.intercept({ path: '/oauth/token', method: 'POST' }).reply(200, {
    accessToken: makeJwt({ exp: Math.floor(Date.parse('2099-01-01') / 1000) }),
    tokenType: 'Bearer',
    expiresIn: 86400,
  })
}

describe('financy connections list', () => {
  it('emits the {data, count, nextPage} envelope under --json', async () => {
    const { pool, close } = mockApi()
    teardown = close
    mockToken(pool)
    pool
      .intercept({ path: '/v2/connections', method: 'GET' })
      .reply(200, connectionsResponse)

    const { code, stdout, stderr } = await runCli(['connections', 'list', '--json'], {
      env: ENV,
    })

    expect(stderr).toBe('')
    expect(code).toBe(0)
    const payload = JSON.parse(stdout)
    expect(payload.count).toBe(2)
    expect(payload.nextPage).toBeNull()
    expect(payload.data.map((c: { providerId: string }) => c.providerId)).toEqual([
      'HAPOALIM',
      'CAL',
    ])
  })

  it('renders a table by default', async () => {
    const { pool, close } = mockApi()
    teardown = close
    mockToken(pool)
    pool
      .intercept({ path: '/v2/connections', method: 'GET' })
      .reply(200, connectionsResponse)

    const { code, stdout } = await runCli(['connections', 'list'], { env: ENV })

    expect(code).toBe(0)
    expect(stdout).toContain('PROVIDER')
    expect(stdout).toContain('STATUS')
    expect(stdout).toContain('HAPOALIM')
    expect(stdout).toContain('CAL')
  })
})

describe('financy connections get', () => {
  it('returns the single connection', async () => {
    const { pool, close } = mockApi()
    teardown = close
    mockToken(pool)
    pool
      .intercept({ path: '/v2/connections/conn_01HTX4M9K2', method: 'GET' })
      .reply(200, connectionsResponse.items[0])

    const { code, stdout } = await runCli(
      ['connections', 'get', 'conn_01HTX4M9K2', '--json'],
      { env: ENV },
    )

    expect(code).toBe(0)
    expect(JSON.parse(stdout).data.id).toBe('conn_01HTX4M9K2')
  })

  it('exits 6 with a JSON error when the id is unknown', async () => {
    const { pool, close } = mockApi()
    teardown = close
    mockToken(pool)
    pool
      .intercept({ path: '/v2/connections/conn_missing', method: 'GET' })
      .reply(404, { message: 'not found' })

    const { code, stdout, stderr } = await runCli(
      ['connections', 'get', 'conn_missing', '--json'],
      { env: ENV },
    )

    expect(code).toBe(6)
    expect(stdout).toBe('')
    expect(JSON.parse(stderr).error.code).toBe('CONNECTION_NOT_FOUND')
  })
})
