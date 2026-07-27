import { MockAgent, setGlobalDispatcher } from 'undici'
import { makeJwt } from './jwt.js'

export const API_ORIGIN = 'https://api.open-finance.ai'

/** Seed a successful token-mint response (token valid far into the future). */
export function seedToken(pool: ReturnType<MockAgent['get']>): void {
  pool.intercept({ path: '/oauth/token', method: 'POST' }).reply(200, {
    accessToken: makeJwt({ exp: Math.floor(Date.parse('2099-01-01') / 1000) }),
    tokenType: 'Bearer',
    expiresIn: 86400,
  })
}

/**
 * Install an undici MockAgent as the global dispatcher so all `fetch` calls are
 * intercepted (real network disabled). Returns the agent's interceptor pool for
 * the Open-Finance origin plus a teardown to call in afterEach.
 */
export function mockApi(): {
  agent: MockAgent
  pool: ReturnType<MockAgent['get']>
  close: () => Promise<void>
} {
  const agent = new MockAgent()
  agent.disableNetConnect()
  setGlobalDispatcher(agent)
  const pool = agent.get(API_ORIGIN)
  return {
    agent,
    pool,
    close: async () => {
      await agent.close()
    },
  }
}
