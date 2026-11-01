import { describe, it, expect, afterEach } from 'vitest'
import { mockApi, seedToken } from './helpers/mock-api.js'
import { testConfigDir } from './setup.js'
import { callTool } from '../src/mcp/tools.js'
import { callLocalTool } from '../src/mcp/integration-tools.js'
import { redactIdentifiers } from '../src/mcp/redact.js'
import { INTEGRATION_ID, CUSTOMER_ID, customer, freshness } from './fixtures/integrations.js'

let teardown: (() => Promise<void>) | undefined
afterEach(async () => {
  await teardown?.()
  teardown = undefined
})

function env() {
  return {
    FINANCY_CLIENT_ID: 'cid',
    FINANCY_CLIENT_SECRET: 'secret',
    FINANCY_USER_ID: 'uid',
    FINANCY_CONFIG_DIR: testConfigDir(),
  }
}

// A transaction a person recategorized and reclassified: their login rides on both stamps.
const transaction = {
  id: 'txn_1',
  SK: 'TRANSACTION#txn_1',
  accountId: 'acc_1',
  connectionId: 'conn_1',
  orgId: 'org_1',
  userId: 'person@example.com',
  psuId: '000000018',
  psuIdType: 'ID',
  ownerInfo: { name: 'ישראל ישראלי', nationalId: '000000018' },
  category: { main: 'SHOPPING', sub: 'SHOPPING_OTHER', categorizedBy: 'MCC' },
  changedCategory: { main: 'CUSTOM_01K8Z3Q4R5S6T7V8W9X0Y1Z2A3', categorizedBy: 'person@example.com' },
  changedClassification: { main: 'EXPENSE', classifiedBy: 'person@example.com' },
}

describe('redactIdentifiers', () => {
  it('strips identifiers at any depth and reads a person\'s stamp as USER', () => {
    expect(redactIdentifiers({ data: [transaction] })).toEqual({
      data: [
        {
          id: 'txn_1',
          SK: 'TRANSACTION#txn_1',
          accountId: 'acc_1',
          connectionId: 'conn_1',
          ownerInfo: { name: 'ישראל ישראלי' },
          category: { main: 'SHOPPING', sub: 'SHOPPING_OTHER', categorizedBy: 'MCC' },
          changedCategory: { main: 'CUSTOM_01K8Z3Q4R5S6T7V8W9X0Y1Z2A3', categorizedBy: 'USER' },
          changedClassification: { main: 'EXPENSE', classifiedBy: 'USER' },
        },
      ],
    })
  })

  it('keeps every system stamp', () => {
    for (const stamp of ['KEYWORDS', 'MCC', 'GOOGLE', 'SYSTEM', 'GPT', 'NONE', 'USER']) {
      expect(redactIdentifiers({ categorizedBy: stamp })).toEqual({ categorizedBy: stamp })
    }
    for (const stamp of ['SYSTEM', 'USER']) {
      expect(redactIdentifiers({ classifiedBy: stamp })).toEqual({ classifiedBy: stamp })
    }
  })
})

describe('the local MCP server redacts its results', () => {
  function setup() {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    return pool
  }

  it('list_transactions leaves without the person\'s ids, keeping the ids tools take', async () => {
    const pool = setup()
    pool
      .intercept({ path: (p) => p.startsWith('/v2/data/transactions'), method: 'GET' })
      .reply(200, { items: [transaction], nextPage: null, count: 1 })

    const result = (await callLocalTool('list_transactions', {}, { env: env() })) as { data: [Record<string, unknown>] }

    const [row] = result.data
    expect(row).not.toHaveProperty('userId')
    expect(row).not.toHaveProperty('orgId')
    expect(row).not.toHaveProperty('psuId')
    expect(row.ownerInfo).toEqual({ name: 'ישראל ישראלי' })
    expect(row.changedCategory).toMatchObject({ categorizedBy: 'USER' })
    expect(row.changedClassification).toMatchObject({ classifiedBy: 'USER' })
    expect(row).toMatchObject({ id: 'txn_1', SK: 'TRANSACTION#txn_1', accountId: 'acc_1', connectionId: 'conn_1' })
    expect(JSON.stringify(result)).not.toContain('person@example.com')
  })

  it('get_invoicing_customer leaves without the customer\'s tax id, keeping its id', async () => {
    const pool = setup()
    pool
      .intercept({ path: `/integrations/${INTEGRATION_ID}/customers/${CUSTOMER_ID}`, method: 'GET' })
      .reply(200, { customer, freshness })

    const result = (await callLocalTool(
      'get_invoicing_customer',
      { integrationId: INTEGRATION_ID, counterpartyId: CUSTOMER_ID },
      { env: env() },
    )) as { data: Record<string, unknown> }

    expect(result.data).not.toHaveProperty('businessTaxId')
    expect(result.data).toMatchObject({ id: CUSTOMER_ID, integrationId: INTEGRATION_ID })
  })

  it('leaves the published callTool whole, for hosts that redact their own way', async () => {
    const pool = setup()
    pool
      .intercept({ path: (p) => p.startsWith('/v2/data/transactions'), method: 'GET' })
      .reply(200, { items: [transaction], nextPage: null, count: 1 })

    const result = await callTool('list_transactions', {}, { env: env() })

    expect(result).toEqual({ data: [transaction], count: 1, nextPage: null })
  })
})
