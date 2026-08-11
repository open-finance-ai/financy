import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { mockApi } from './helpers/mock-api.js'
import { makeJwt } from './helpers/jwt.js'
import { connectionsResponse } from './fixtures/connections.js'
import { runCli } from './helpers/run-cli.js'
import { testConfigDir } from './setup.js'

const CREDS = {
  FINANCY_CLIENT_ID: 'cid',
  FINANCY_CLIENT_SECRET: 'secret',
  FINANCY_USER_ID: 'uid',
}
const validToken = () => makeJwt({ exp: Math.floor(Date.parse('2099-01-01') / 1000) })

let teardown: (() => Promise<void>) | undefined
afterEach(async () => {
  await teardown?.()
  teardown = undefined
})

/** Mock a successful validation round-trip: mint a token + one cheap read. */
function mockValidation() {
  const { pool, close } = mockApi()
  teardown = close
  pool.intercept({ path: '/oauth/token', method: 'POST' }).reply(200, {
    accessToken: validToken(),
    tokenType: 'Bearer',
    expiresIn: 86400,
  })
  pool
    .intercept({ path: '/v2/connections', method: 'GET' })
    .reply(200, connectionsResponse)
  return { pool }
}

describe('financy setup --no-input', () => {
  it('validates env credentials and writes a 0600 config file', async () => {
    mockValidation()

    const { code, stdout, stderr } = await runCli(['setup', '--no-input'], { env: CREDS })

    expect(stderr).toBe('')
    expect(code).toBe(0)
    expect(stdout).toMatch(/financy status/)
    // Non-interactive (agents/CI) must not get the human onboarding prose.
    expect(stdout).not.toMatch(/paid plan/i)

    const file = join(testConfigDir(), 'config.json')
    expect(existsSync(file)).toBe(true)
    // Windows does not enforce Unix file modes, so the bits mean nothing there.
    if (process.platform !== 'win32') {
      expect(statSync(file).mode & 0o777).toBe(0o600)
    }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      profiles: { default: { clientId: 'cid', clientSecret: 'secret', userId: 'uid' } },
    })
  })

  it('exits 3, writes no config, and says nothing was saved when credentials are invalid', async () => {
    const { pool, close } = mockApi()
    teardown = close
    pool
      .intercept({ path: '/oauth/token', method: 'POST' })
      .reply(401, { error: 'access_denied' })

    const { code, stderr } = await runCli(['setup', '--no-input'], { env: CREDS })

    expect(code).toBe(3)
    expect(existsSync(join(testConfigDir(), 'config.json'))).toBe(false)
    // A silent non-save is what made a failed setup look like a successful one.
    expect(stderr).toMatch(/Nothing was saved/)
  })

  it.each(['--client-secret', '--client-id', '--user-id'])(
    'rejects the secret-bearing flag %s with exit 2',
    async (flag) => {
      const { code } = await runCli(['setup', flag, 'leak'], { env: CREDS })
      expect(code).toBe(2)
    },
  )

  it('saves the credentials but exits 4 with an upgrade message on a free plan', async () => {
    const { pool, close } = mockApi()
    teardown = close
    pool.intercept({ path: '/oauth/token', method: 'POST' }).reply(200, {
      accessToken: validToken(),
      tokenType: 'Bearer',
      expiresIn: 86400,
    })
    pool
      .intercept({ path: '/v2/connections', method: 'GET' })
      .reply(403, { message: 'NOT_AVAILABLE_ON_PLAN' })

    const { code, stderr } = await runCli(['setup', '--no-input'], { env: CREDS })

    expect(code).toBe(4)
    expect(stderr).toMatch(/upgrade/i)
    // Credentials are persisted so a later plan upgrade "just works".
    expect(existsSync(join(testConfigDir(), 'config.json'))).toBe(true)
  })
})

describe('financy setup (interactive)', () => {
  it('collects the three values via prompts, validates, and writes config', async () => {
    mockValidation()
    const answers: Record<string, string> = {
      'Client ID': 'icid',
      'Client secret': 'isecret',
      'User ID': 'iuid',
    }

    const { code, stderr, stdout } = await runCli(['setup'], {
      env: {},
      prompt: async ({ label }) => answers[label]!,
    })

    expect(stderr).toBe('')
    expect(code).toBe(0)
    // Interactive setup explains where the credentials come from and the paid requirement.
    expect(stdout).toMatch(/paid plan/i)
    expect(stdout).toMatch(/Settings → API/)
    expect(JSON.parse(readFileSync(join(testConfigDir(), 'config.json'), 'utf8'))).toEqual({
      profiles: { default: { clientId: 'icid', clientSecret: 'isecret', userId: 'iuid' } },
    })
  })
})

describe('credential resolution', () => {
  it('env vars override the config file per field (verified via the status mint request)', async () => {
    writeFileSync(
      join(testConfigDir(), 'config.json'),
      JSON.stringify({
        profiles: {
          default: { clientId: 'file-cid', clientSecret: 'file-secret', userId: 'file-uid' },
        },
      }),
      { mode: 0o600 },
    )

    const { pool, close } = mockApi()
    teardown = close
    let mintBody: Record<string, string> = {}
    pool.intercept({ path: '/oauth/token', method: 'POST' }).reply((opts) => {
      mintBody = JSON.parse(opts.body as string)
      return {
        statusCode: 200,
        data: JSON.stringify({ accessToken: validToken(), tokenType: 'Bearer', expiresIn: 86400 }),
      }
    })
    pool
      .intercept({ path: '/v2/connections', method: 'GET' })
      .reply(200, connectionsResponse)

    const { code } = await runCli(['status', '--json'], {
      env: { FINANCY_CLIENT_ID: 'env-cid' },
    })

    expect(code).toBe(0)
    expect(mintBody.clientId).toBe('env-cid') // env overrides file
    expect(mintBody.userId).toBe('file-uid') // from file (not set in env)
    expect(mintBody.clientSecret).toBe('file-secret')
  })
})
