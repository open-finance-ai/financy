import { describe, it, expect, afterEach } from 'vitest'
import { mockApi, seedToken } from './helpers/mock-api.js'
import { runCli } from './helpers/run-cli.js'

const ENV = {
  FINANCY_CLIENT_ID: 'cid',
  FINANCY_CLIENT_SECRET: 'secret',
  FINANCY_USER_ID: 'google-oauth2|1044',
}

const REFRESH = { path: '/chat/chat/connections/refresh', method: 'POST' }

let teardown: (() => Promise<void>) | undefined

afterEach(async () => {
  await teardown?.()
  teardown = undefined
})

describe('financy refresh --json', () => {
  it('posts to the service-chat refresh route and emits the result in the {data} envelope', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool
      .intercept(REFRESH)
      .reply(200, { status: 'accepted', connections: 2, cost: 20 })

    const { code, stdout, stderr } = await runCli(['refresh', '--json'], { env: ENV })

    expect(stderr).toBe('')
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual({
      data: { status: 'accepted', connections: 2, cost: 20 },
    })
  })

  it('handles the live accepted body that carries only {status} (no connections/cost)', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept(REFRESH).reply(200, { status: 'accepted' }) // real prod shape

    const { code, stdout, stderr } = await runCli(['refresh'], { env: ENV })

    expect(stderr).toBe('')
    expect(code).toBe(0)
    expect(stdout).toContain('20 credits')
    expect(stdout).toContain('your connections') // generic when count is absent
    expect(stdout).not.toMatch(/undefined/)
  })
})

describe('financy refresh (human)', () => {
  it('reports how many connections started refreshing and the credit cost, pointing at status', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept(REFRESH).reply(200, { status: 'accepted', connections: 2, cost: 20 })

    const { code, stdout, stderr } = await runCli(['refresh'], { env: ENV })

    expect(stderr).toBe('')
    expect(code).toBe(0)
    expect(stdout).toContain('2 connections')
    expect(stdout).toContain('20 credits')
    expect(stdout).toMatch(/financy status/)
  })

  it('reports an in-flight refresh when the server says already_running', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept(REFRESH).reply(200, { status: 'already_running', connections: 2, cost: 20 })

    const { code, stdout, stderr } = await runCli(['refresh'], { env: ENV })

    expect(stderr).toBe('')
    expect(code).toBe(0)
    expect(stdout).toMatch(/already in flight/i)
    expect(stdout).toMatch(/financy status/)
  })
})

describe('financy refresh outcome mapping', () => {
  it('exits 5 (credits) with cost and balance in the JSON error body on HTTP 402', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept(REFRESH).reply(402, { cost: 20, balance: 6 })

    const { code, stdout, stderr } = await runCli(['refresh', '--json'], { env: ENV })

    expect(code).toBe(5)
    expect(stdout).toBe('')
    const payload = JSON.parse(stderr)
    expect(payload.error.code).toBe('INSUFFICIENT_CREDITS')
    expect(payload.error.cost).toBe(20)
    expect(payload.error.balance).toBe(6)
  })

  it("exits 1 with the server's message on HTTP 409 (nothing to refresh)", async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool
      .intercept(REFRESH)
      .reply(409, { message: 'no connections are eligible for refresh' })

    const { code, stdout, stderr } = await runCli(['refresh', '--json'], { env: ENV })

    expect(code).toBe(1)
    expect(stdout).toBe('')
    const payload = JSON.parse(stderr)
    expect(payload.error.code).toBe('NO_REFRESHABLE_CONNECTIONS')
    expect(payload.error.message).toBe('no connections are eligible for refresh')
  })

  it('exits 4 (plan) on HTTP 403 for a free/ineligible plan', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept(REFRESH).reply(403, { message: 'NOT_AVAILABLE_ON_PLAN' })

    const { code, stderr } = await runCli(['refresh', '--json'], { env: ENV })

    expect(code).toBe(4)
    expect(JSON.parse(stderr).error.code).toBe('NOT_AVAILABLE_ON_PLAN')
  })

  it('emits already_running in the {data} envelope under --json', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept(REFRESH).reply(200, { status: 'already_running', connections: 2, cost: 20 })

    const { code, stdout } = await runCli(['refresh', '--json'], { env: ENV })

    expect(code).toBe(0)
    expect(JSON.parse(stdout).data.status).toBe('already_running')
  })

  it('renders a one-line credits error on stderr in human mode (HTTP 402)', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept(REFRESH).reply(402, { cost: 20, balance: 6 })

    const { code, stdout, stderr } = await runCli(['refresh'], { env: ENV })

    expect(code).toBe(5)
    expect(stdout).toBe('')
    expect(stderr).toMatch(/INSUFFICIENT_CREDITS/)
    expect(stderr).toContain('20')
    expect(stderr).toContain('6')
  })

  it('renders a one-line nothing-to-refresh error on stderr in human mode (HTTP 409)', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    pool.intercept(REFRESH).reply(409, { message: 'no connections are eligible for refresh' })

    const { code, stdout, stderr } = await runCli(['refresh'], { env: ENV })

    expect(code).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toContain('no connections are eligible for refresh')
  })

  it('re-mints the token and retries once when the refresh call returns 401', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    seedToken(pool)
    pool.intercept(REFRESH).reply(401, {})
    pool.intercept(REFRESH).reply(200, { status: 'accepted', connections: 1, cost: 20 })

    const { code, stdout, stderr } = await runCli(['refresh', '--json'], { env: ENV })

    expect(stderr).toBe('')
    expect(code).toBe(0)
    expect(JSON.parse(stdout).data.connections).toBe(1)
  })
})
