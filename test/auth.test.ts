import { describe, it, expect, afterEach } from 'vitest'
import { mockApi } from './helpers/mock-api.js'
import { makeJwt } from './helpers/jwt.js'
import { connectionsResponse } from './fixtures/connections.js'
import { runCli } from './helpers/run-cli.js'

const ENV = {
  FINANCY_CLIENT_ID: 'cid',
  FINANCY_CLIENT_SECRET: 'secret',
  FINANCY_USER_ID: 'test@example.com',
}

let teardown: (() => Promise<void>) | undefined

afterEach(async () => {
  await teardown?.()
  teardown = undefined
})

describe('token mint request contract', () => {
  it('POSTs the camelCase {userId, clientId, clientSecret} body the gateway expects', async () => {
    const { pool, close } = mockApi()
    teardown = close

    let sentBody: unknown
    pool.intercept({ path: '/oauth/token', method: 'POST' }).reply((opts) => {
      sentBody = JSON.parse(opts.body as string)
      return {
        statusCode: 200,
        data: JSON.stringify({
          accessToken: makeJwt({ exp: Math.floor(Date.parse('2099-01-01') / 1000) }),
          tokenType: 'Bearer',
          expiresIn: 86400,
        }),
      }
    })
    pool.intercept({ path: '/v2/connections', method: 'GET' }).reply(200, connectionsResponse)

    const { code, stderr } = await runCli(['status', '--json'], { env: ENV })

    expect(stderr).toBe('')
    expect(code).toBe(0)
    // Exactly the three fields the public token endpoint validates — camelCase, no
    // grant_type / audience (those belong to the server-side Auth0 exchange).
    expect(sentBody).toEqual({
      userId: 'test@example.com',
      clientId: 'cid',
      clientSecret: 'secret',
    })
  })
})
