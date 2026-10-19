import { describe, it, expect, afterEach } from 'vitest'
import { mockApi, seedToken } from './helpers/mock-api.js'
import { testConfigDir } from './setup.js'
import { callTool, TOOLS } from '../src/mcp/tools.js'
import { INTEGRATION_TOOLS, LOCAL_TOOLS, callLocalTool } from '../src/mcp/integration-tools.js'
import {
  INTEGRATION_ID,
  DOCUMENT_ID,
  CUSTOMER_ID,
  PROPOSAL_ID,
  integration,
  document,
  freshness,
  receivables,
  proposal,
  upgradeRequired,
  CLEARING_ID,
  settlementSettled,
} from './fixtures/integrations.js'

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

function setup() {
  const { pool, close } = mockApi()
  teardown = close
  seedToken(pool)
  return pool
}

const BASE = '/integrations'
const DRAFT_TOOLS = ['draft_invoice', 'draft_invoice_receipt', 'draft_receipt', 'draft_credit_note']

describe('invoicing tool registry', () => {
  it('serves exactly these invoicing tools', () => {
    expect(INTEGRATION_TOOLS.map((t) => t.name).sort()).toEqual(
      [
        'list_integrations',
        'get_integration',
        'get_receivables',
        'list_invoicing_documents',
        'get_invoicing_document',
        'list_invoicing_customers',
        'get_invoicing_customer',
        'list_clearing_settlements',
        'list_proposals',
        'get_proposal',
        ...DRAFT_TOOLS,
      ].sort(),
    )
  })

  it('keeps them out of the published TOOLS table, so importing hosts see no duplicate names', () => {
    const published = new Set(TOOLS.map((t) => t.name))
    for (const tool of INTEGRATION_TOOLS) expect(published.has(tool.name)).toBe(false)
    expect(TOOLS).toHaveLength(11)
  })

  it('the local server lists every published tool plus the invoicing tools, each name once', () => {
    const names = LOCAL_TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toHaveLength(TOOLS.length + INTEGRATION_TOOLS.length)
  })

  it('the published callTool does not route invoicing tools', async () => {
    const result = await callTool('list_integrations', {}, { env: env() })

    expect(result).toMatchObject({ error: { code: 'UNKNOWN_TOOL' } })
  })

  it('every draft tool says nothing is issued until the user approves in Financy', () => {
    for (const name of DRAFT_TOOLS) {
      const tool = INTEGRATION_TOOLS.find((t) => t.name === name)!
      expect(tool.description).toMatch(/DRAFT/)
      expect(tool.description).toMatch(/approve/i)
      expect(tool.description).toMatch(/approvalUrl/)
    }
  })

  it('list_integrations names every supported invoicing system and the clearing one', () => {
    const tool = INTEGRATION_TOOLS.find((t) => t.name === 'list_integrations')!
    for (const system of ['Invoice4U', 'Morning', 'SUMIT', 'iCount', 'Isracard Business']) {
      expect(tool.description).toContain(system)
    }
  })

  it('gives every tool a description and an object input schema', () => {
    for (const tool of INTEGRATION_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20)
      expect(tool.inputSchema.type).toBe('object')
    }
  })

  it('returns NOT_CONFIGURED from every invoicing tool when unconfigured', async () => {
    const bareEnv = { FINANCY_CONFIG_DIR: testConfigDir() }
    for (const tool of INTEGRATION_TOOLS) {
      const result = await callLocalTool(tool.name, {}, { env: bareEnv })
      expect(result).toMatchObject({ error: { code: 'NOT_CONFIGURED' } })
    }
  })

  it('callLocalTool still routes the published tools', async () => {
    const pool = setup()
    pool.intercept({ path: '/v2/connections', method: 'GET' }).reply(200, { items: [], nextPage: null, count: 0 })

    const result = await callLocalTool('list_connections', {}, { env: env() })

    expect(result).toEqual({ data: [], count: 0, nextPage: null })
  })
})

describe('invoicing read tools', () => {
  it('list_integrations returns the CLI list envelope', async () => {
    const pool = setup()
    pool.intercept({ path: `${BASE}/`, method: 'GET' }).reply(200, { items: [integration] })

    const result = await callLocalTool('list_integrations', {}, { env: env() })

    expect(result).toEqual({ data: [integration], count: 1, nextPage: null })
  })

  it('get_integration requires integrationId', async () => {
    setup()

    const result = await callLocalTool('get_integration', {}, { env: env() })

    expect(result).toMatchObject({ error: { code: 'MISSING_ARGUMENT' } })
  })

  it('get_receivables maps integrationIds and format to the query', async () => {
    const pool = setup()
    let seen = ''
    pool.intercept({ path: (p) => p.startsWith(`${BASE}/receivables`), method: 'GET' }).reply((opts) => {
      seen = opts.path
      return { statusCode: 200, data: JSON.stringify(receivables) }
    })

    const result = await callLocalTool(
      'get_receivables',
      { integrationIds: [INTEGRATION_ID], format: 'detailed', asOf: '2026-10-01' },
      { env: env() },
    )

    const q = new URLSearchParams(seen.split('?')[1])
    expect(q.get('integrationIds')).toBe(INTEGRATION_ID)
    expect(q.get('format')).toBe('detailed')
    expect(q.get('asOf')).toBe('2026-10-01')
    expect(result).toEqual({ data: receivables })
  })

  it('get_receivables surfaces UPGRADE_REQUIRED as a structured error', async () => {
    const pool = setup()
    pool.intercept({ path: (p) => p.startsWith(`${BASE}/receivables`), method: 'GET' }).reply(403, upgradeRequired)

    const result = await callLocalTool('get_receivables', {}, { env: env() })

    expect(result).toMatchObject({
      error: { code: 'UPGRADE_REQUIRED', userActionRequired: true, action: { kind: 'upgrade' } },
    })
  })

  it('list_invoicing_documents maps its filters and pages with the cursor', async () => {
    const pool = setup()
    let seen = ''
    pool
      .intercept({ path: (p) => p.startsWith(`${BASE}/${INTEGRATION_ID}/documents`), method: 'GET' })
      .reply((opts) => {
        seen = opts.path
        return { statusCode: 200, data: JSON.stringify({ items: [document], nextCursor: 'CUR2', freshness }) }
      })

    const result = await callLocalTool(
      'list_invoicing_documents',
      { integrationId: INTEGRATION_ID, status: 'open', counterpartyId: CUSTOMER_ID, receivableOnly: true, limit: 5, cursor: 'CUR1' },
      { env: env() },
    )

    const q = new URLSearchParams(seen.split('?')[1])
    expect(q.get('status')).toBe('open')
    expect(q.get('counterpartyId')).toBe(CUSTOMER_ID)
    expect(q.get('receivableOnly')).toBe('true')
    expect(q.get('limit')).toBe('5')
    expect(q.get('cursor')).toBe('CUR1')
    expect(result).toEqual({ data: [document], count: 1, nextPage: 'CUR2', freshness })
  })

  it('get_invoicing_document returns the document and its freshness', async () => {
    const pool = setup()
    pool
      .intercept({ path: `${BASE}/${INTEGRATION_ID}/documents/${DOCUMENT_ID}`, method: 'GET' })
      .reply(200, { document, freshness, meta: {} })

    const result = await callLocalTool(
      'get_invoicing_document',
      { integrationId: INTEGRATION_ID, documentId: DOCUMENT_ID },
      { env: env() },
    )

    expect(result).toEqual({ data: document, freshness })
  })

  it('list_invoicing_customers sends q', async () => {
    const pool = setup()
    let seen = ''
    pool
      .intercept({ path: (p) => p.startsWith(`${BASE}/${INTEGRATION_ID}/customers`), method: 'GET' })
      .reply((opts) => {
        seen = opts.path
        return { statusCode: 200, data: JSON.stringify({ items: [], nextCursor: null, freshness }) }
      })

    await callLocalTool('list_invoicing_customers', { integrationId: INTEGRATION_ID, q: 'סטודיו' }, { env: env() })

    expect(new URLSearchParams(seen.split('?')[1]).get('q')).toBe('סטודיו')
  })

  it('list_clearing_settlements maps its filters and hides the merchant number', async () => {
    const pool = setup()
    let seen = ''
    pool
      .intercept({ path: (p) => p.startsWith(`${BASE}/${CLEARING_ID}/settlements`), method: 'GET' })
      .reply((opts) => {
        seen = opts.path
        return { statusCode: 200, data: JSON.stringify({ items: [settlementSettled], nextCursor: null, freshness }) }
      })

    const result = (await callLocalTool(
      'list_clearing_settlements',
      { integrationId: CLEARING_ID, status: 'expected', paymentFrom: '2026-10-01', paymentTo: '2026-10-31', limit: 10 },
      { env: env() },
    )) as { data: Record<string, unknown>[]; freshness: unknown }

    const q = new URLSearchParams(seen.split('?')[1])
    expect(q.get('status')).toBe('expected')
    expect(q.get('paymentFrom')).toBe('2026-10-01')
    expect(q.get('paymentTo')).toBe('2026-10-31')
    expect(q.get('limit')).toBe('10')
    expect(result.data[0]).not.toHaveProperty('branch')
    expect(result.data[0]).not.toHaveProperty('providerId')
    expect(result.data[0]).toMatchObject({ id: settlementSettled.id, payoutAccount: '1234', amounts: settlementSettled.amounts })
    expect(result.freshness).toEqual(freshness)
  })

  it('get_proposal returns the draft with its approval link', async () => {
    const pool = setup()
    pool.intercept({ path: `${BASE}/proposals/${PROPOSAL_ID}`, method: 'GET' }).reply(200, { proposal })

    const result = await callLocalTool('get_proposal', { proposalId: PROPOSAL_ID }, { env: env() })

    expect(result).toEqual({ data: proposal })
  })
})

describe('invoicing draft tools', () => {
  function capturePost(pool: ReturnType<typeof setup>) {
    const seen: { body?: unknown } = {}
    pool.intercept({ path: `${BASE}/${INTEGRATION_ID}/proposals`, method: 'POST' }).reply((opts) => {
      seen.body = JSON.parse(opts.body as string)
      return { statusCode: 201, data: JSON.stringify({ proposal }) }
    })
    return seen
  }

  it('draft_invoice posts a create_tax_invoice proposal and returns the draft', async () => {
    const pool = setup()
    const seen = capturePost(pool)
    const lines = [{ description: 'עיצוב לוגו', quantity: 1, unitPriceMinor: 234000 }]

    const result = await callLocalTool(
      'draft_invoice',
      { integrationId: INTEGRATION_ID, counterpartyId: CUSTOMER_ID, lines, pricesIncludeVat: true, recipients: ['test@example.com'] },
      { env: env() },
    )

    expect(seen.body).toEqual({
      action: 'create_tax_invoice',
      items: [{ counterpartyId: CUSTOMER_ID, lines, pricesIncludeVat: true, recipients: ['test@example.com'] }],
    })
    expect(result).toEqual({ data: proposal, replayed: false })
  })

  it('draft_receipt nests the payment fields', async () => {
    const pool = setup()
    const seen = capturePost(pool)

    await callLocalTool(
      'draft_receipt',
      { integrationId: INTEGRATION_ID, targetDocumentId: DOCUMENT_ID, paymentMethod: 'bank_transfer', paymentDate: '2026-10-11' },
      { env: env() },
    )

    expect(seen.body).toEqual({
      action: 'create_receipt',
      items: [{ targetDocumentId: DOCUMENT_ID, payment: { method: 'bank_transfer', date: '2026-10-11' } }],
    })
  })

  it('draft_invoice_receipt carries both the invoice and the payment', async () => {
    const pool = setup()
    const seen = capturePost(pool)
    const lines = [{ description: 'ייעוץ', quantity: 2, unitPriceMinor: 117000 }]

    await callLocalTool(
      'draft_invoice_receipt',
      {
        integrationId: INTEGRATION_ID,
        counterpartyId: CUSTOMER_ID,
        lines,
        pricesIncludeVat: true,
        paymentMethod: 'card',
        paymentDate: '2026-10-11',
        paymentReference: 'ref-1',
      },
      { env: env() },
    )

    expect(seen.body).toEqual({
      action: 'create_invoice_receipt',
      items: [
        {
          counterpartyId: CUSTOMER_ID,
          lines,
          pricesIncludeVat: true,
          payment: { method: 'card', date: '2026-10-11', reference: 'ref-1' },
        },
      ],
    })
  })

  it('draft_credit_note copies the shared recipients onto every item', async () => {
    const pool = setup()
    const seen = capturePost(pool)

    await callLocalTool(
      'draft_credit_note',
      { integrationId: INTEGRATION_ID, recipients: ['test@example.com'], items: [{ targetDocumentId: DOCUMENT_ID, amountMinor: 50000 }] },
      { env: env() },
    )

    expect(seen.body).toEqual({
      action: 'create_credit_note',
      items: [{ targetDocumentId: DOCUMENT_ID, amountMinor: 50000, recipients: ['test@example.com'] }],
    })
  })

  it('a draft tool without integrationId is refused before any request', async () => {
    setup()

    const result = await callLocalTool('draft_invoice', { counterpartyId: CUSTOMER_ID }, { env: env() })

    expect(result).toMatchObject({ error: { code: 'MISSING_ARGUMENT' } })
  })
})
