import { describe, it, expect, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mockApi, seedToken } from './helpers/mock-api.js'
import { runCli } from './helpers/run-cli.js'
import { testConfigDir } from './setup.js'
import { makeJwt } from './helpers/jwt.js'
import {
  INTEGRATION_ID,
  DOCUMENT_ID,
  CUSTOMER_ID,
  PROPOSAL_ID,
  integration,
  document,
  customer,
  freshness,
  receivables,
  proposal,
  draftRequest,
  upgradeRequired,
  CLEARING_ID,
  clearingIntegration,
  settlementSettled,
  settlementExpected,
} from './fixtures/integrations.js'

const ENV = {
  FINANCY_CLIENT_ID: 'cid',
  FINANCY_CLIENT_SECRET: 'secret',
  FINANCY_USER_ID: 'uid',
}
const BASE = '/integrations'

let teardown: (() => Promise<void>) | undefined
afterEach(async () => {
  await teardown?.()
  teardown = undefined
})

function setup() {
  const { pool, close } = mockApi()
  teardown = close
  seedToken(pool)
  return pool
}

function capture(pool: ReturnType<typeof setup>, method: string, prefix: string, body: unknown, status = 200) {
  const seen: { path: string; headers: Record<string, string>; body?: string }[] = []
  pool.intercept({ path: (p) => p.startsWith(prefix), method }).reply((opts) => {
    seen.push({
      path: opts.path,
      headers: opts.headers as Record<string, string>,
      body: typeof opts.body === 'string' ? opts.body : undefined,
    })
    return { statusCode: status, data: JSON.stringify(body) }
  })
  return seen
}

const query = (path: string) => new URLSearchParams(path.split('?')[1])

describe('financy integrations', () => {
  it('lists integrations from the list route, with its trailing slash', async () => {
    const pool = setup()
    const seen = capture(pool, 'GET', `${BASE}/`, { items: [integration] })

    const { code, stdout } = await runCli(['integrations', 'list'], { env: ENV })

    expect(code).toBe(0)
    expect(seen[0]!.path).toBe(`${BASE}/`)
    expect(stdout).toContain(INTEGRATION_ID)
    expect(stdout).toContain('Invoice4U')
    expect(stdout).toContain('active')
  })

  it('emits the {data,count,nextPage} envelope under --json', async () => {
    const pool = setup()
    capture(pool, 'GET', `${BASE}/`, { items: [integration] })

    const { stdout } = await runCli(['integrations', 'list', '--json'], { env: ENV })

    expect(JSON.parse(stdout)).toEqual({ data: [integration], count: 1, nextPage: null })
  })

  it('get unwraps {integration} into {data}', async () => {
    const pool = setup()
    capture(pool, 'GET', `${BASE}/${INTEGRATION_ID}`, { integration })

    const { code, stdout } = await runCli(['integrations', 'get', INTEGRATION_ID, '--json'], { env: ENV })

    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual({ data: integration })
  })

  it('sends the CLI bearer token', async () => {
    const pool = setup()
    const seen = capture(pool, 'GET', `${BASE}/`, { items: [] })

    await runCli(['integrations', 'list'], { env: ENV })

    expect(seen[0]!.headers.authorization).toMatch(/^Bearer /)
  })

  it('honours FINANCY_INTEGRATIONS_URL', async () => {
    const pool = setup()
    const seen = capture(pool, 'GET', '/staging-integrations/', { items: [] })

    const { code } = await runCli(['integrations', 'list'], {
      env: { ...ENV, FINANCY_INTEGRATIONS_URL: 'https://api.open-finance.ai/staging-integrations' },
    })

    expect(code).toBe(0)
    expect(seen).toHaveLength(1)
  })

  it('refuses an id that is not id-shaped before calling the API', async () => {
    setup()

    const { code, stderr } = await runCli(['integrations', 'get', '..', '--json'], { env: ENV })

    expect(code).toBe(2)
    expect(JSON.parse(stderr).error.code).toBe('INVALID_ARGUMENT')
  })
})

describe('financy receivables', () => {
  it('renders totals and the per-customer table in shekels, not agorot', async () => {
    const pool = setup()
    capture(pool, 'GET', `${BASE}/receivables`, receivables)

    const { code, stdout } = await runCli(['receivables'], { env: ENV })

    expect(code).toBe(0)
    expect(stdout).toContain('₪2,340.00 open')
    expect(stdout).toContain('סטודיו גל')
    expect(stdout).not.toContain('234000')
  })

  it('maps its options to the API query', async () => {
    const pool = setup()
    const seen = capture(pool, 'GET', `${BASE}/receivables`, receivables)

    await runCli(
      [
        'receivables',
        '--integration', INTEGRATION_ID,
        '--as-of', '2026-10-01',
        '--detailed',
        '--customer-limit', '5',
        '--include-proforma',
        '--json',
      ],
      { env: ENV },
    )

    const q = query(seen[0]!.path)
    expect(q.get('integrationIds')).toBe(INTEGRATION_ID)
    expect(q.get('asOf')).toBe('2026-10-01')
    expect(q.get('format')).toBe('detailed')
    expect(q.get('customerLimit')).toBe('5')
    expect(q.get('includeProforma')).toBe('true')
  })

  it('emits the API body under {data} with --json', async () => {
    const pool = setup()
    capture(pool, 'GET', `${BASE}/receivables`, receivables)

    const { stdout } = await runCli(['receivables', '--json'], { env: ENV })

    expect(JSON.parse(stdout)).toEqual({ data: receivables })
  })

  it('notes an integration still on its first sync', async () => {
    const pool = setup()
    capture(pool, 'GET', `${BASE}/receivables`, {
      ...receivables,
      integrations: [{ integrationId: INTEGRATION_ID, ready: 'pending', stale: false }],
    })

    const { stdout } = await runCli(['receivables'], { env: ENV })

    expect(stdout).toMatch(/first sync/)
  })

  it('maps UPGRADE_REQUIRED to exit 4 with the API code and an upgrade hint', async () => {
    const pool = setup()
    capture(pool, 'GET', `${BASE}/receivables`, upgradeRequired, 403)

    const { code, stdout, stderr } = await runCli(['receivables', '--json'], { env: ENV })

    expect(code).toBe(4)
    expect(stdout).toBe('')
    const { error } = JSON.parse(stderr)
    expect(error.code).toBe('UPGRADE_REQUIRED')
    expect(error.message).toMatch(/Settings → Plan/)
    expect(error.userActionRequired).toBe(true)
    expect(error.action).toEqual({ kind: 'upgrade', plan: 'starter' })
    expect(error.requestId).toBe('req_test_1')
  })
})

describe('financy documents', () => {
  it('maps every filter to the API query and renders amounts from minor units', async () => {
    const pool = setup()
    const seen = capture(pool, 'GET', `${BASE}/${INTEGRATION_ID}/documents`, {
      items: [document],
      nextCursor: null,
      freshness,
    })

    const { code, stdout } = await runCli(
      [
        'documents', 'list', INTEGRATION_ID,
        '--status', 'open',
        '--type', 'invoice',
        '--customer', CUSTOMER_ID,
        '--from', '2026-09-01',
        '--to', '2026-09-30',
        '--receivable-only',
        '--number', '1001',
        '--limit', '20',
      ],
      { env: ENV },
    )

    expect(code).toBe(0)
    const q = query(seen[0]!.path)
    expect(q.get('status')).toBe('open')
    expect(q.get('type')).toBe('invoice')
    expect(q.get('counterpartyId')).toBe(CUSTOMER_ID)
    expect(q.get('issuedFrom')).toBe('2026-09-01')
    expect(q.get('issuedTo')).toBe('2026-09-30')
    expect(q.get('receivableOnly')).toBe('true')
    expect(q.get('number')).toBe('1001')
    expect(q.get('limit')).toBe('20')
    expect(stdout).toContain('₪2,340.00')
    expect(stdout).toContain('סטודיו גל')
  })

  it('sorts the table newest first, ties by number descending, but keeps --json in API order', async () => {
    const pool = setup()
    const docs = [
      { ...document, id: 'idoc_OLD', number: '9', issueDate: '2026-08-01' },
      { ...document, id: 'idoc_TIE_LOW', number: '9', issueDate: '2026-09-15' },
      { ...document, id: 'idoc_NEW', number: '1', issueDate: '2026-10-02' },
      { ...document, id: 'idoc_TIE_HIGH', number: '10', issueDate: '2026-09-15' },
    ]
    pool
      .intercept({ path: (p) => p.startsWith(`${BASE}/${INTEGRATION_ID}/documents`), method: 'GET' })
      .reply(200, { items: docs, nextCursor: null, freshness })
      .times(2)

    const table = await runCli(['documents', 'list', INTEGRATION_ID], { env: ENV })
    const json = await runCli(['documents', 'list', INTEGRATION_ID, '--json'], { env: ENV })

    const order = ['idoc_NEW', 'idoc_TIE_HIGH', 'idoc_TIE_LOW', 'idoc_OLD'].map((id) => table.stdout.indexOf(id))
    expect(order.every((pos) => pos > 0)).toBe(true)
    expect([...order].sort((x, y) => x - y)).toEqual(order)
    expect(JSON.parse(json.stdout).data.map((d: { id: string }) => d.id)).toEqual(docs.map((d) => d.id))
  })

  it('--json carries nextCursor as nextPage, plus freshness', async () => {
    const pool = setup()
    capture(pool, 'GET', `${BASE}/${INTEGRATION_ID}/documents`, {
      items: [document],
      nextCursor: 'CUR2',
      freshness,
    })

    const { stdout } = await runCli(['documents', 'list', INTEGRATION_ID, '--json'], { env: ENV })

    expect(JSON.parse(stdout)).toEqual({ data: [document], count: 1, nextPage: 'CUR2', freshness })
  })

  it('--cursor is sent as the API cursor', async () => {
    const pool = setup()
    const seen = capture(pool, 'GET', `${BASE}/${INTEGRATION_ID}/documents`, { items: [], nextCursor: null })

    await runCli(['documents', 'list', INTEGRATION_ID, '--cursor', 'CUR2', '--json'], { env: ENV })

    expect(query(seen[0]!.path).get('cursor')).toBe('CUR2')
  })

  it('--all follows nextCursor to exhaustion', async () => {
    const pool = setup()
    const path = `${BASE}/${INTEGRATION_ID}/documents`
    pool.intercept({ path, method: 'GET' }).reply(200, { items: [{ id: 'idoc_A' }], nextCursor: 'CUR2', freshness })
    pool
      .intercept({ path: `${path}?cursor=CUR2`, method: 'GET' })
      .reply(200, { items: [{ id: 'idoc_B' }], nextCursor: null, freshness })

    const { code, stdout } = await runCli(['documents', 'list', INTEGRATION_ID, '--all', '--json'], { env: ENV })

    expect(code).toBe(0)
    const payload = JSON.parse(stdout)
    expect(payload.data.map((d: { id: string }) => d.id)).toEqual(['idoc_A', 'idoc_B'])
    expect(payload.nextPage).toBeNull()
  })

  it('get returns the document under {data} with its freshness', async () => {
    const pool = setup()
    capture(pool, 'GET', `${BASE}/${INTEGRATION_ID}/documents/${DOCUMENT_ID}`, { document, freshness, meta: {} })

    const { code, stdout } = await runCli(['documents', 'get', INTEGRATION_ID, DOCUMENT_ID, '--json'], { env: ENV })

    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual({ data: document, freshness })
  })

  it('maps a 404 to exit 6 with the API error code', async () => {
    const pool = setup()
    capture(
      pool,
      'GET',
      `${BASE}/${INTEGRATION_ID}/documents/${DOCUMENT_ID}`,
      { type: 'NOT_FOUND', message: 'No such document.', retryable: false, userActionRequired: false, requestId: 'r' },
      404,
    )

    const { code, stderr } = await runCli(['documents', 'get', INTEGRATION_ID, DOCUMENT_ID, '--json'], { env: ENV })

    expect(code).toBe(6)
    expect(JSON.parse(stderr).error.code).toBe('NOT_FOUND')
  })

  it('maps a 400 VALIDATION_FAILED to exit 2', async () => {
    const pool = setup()
    capture(
      pool,
      'GET',
      `${BASE}/${INTEGRATION_ID}/documents`,
      { type: 'VALIDATION_FAILED', message: 'status is not valid.', retryable: false, userActionRequired: false, requestId: 'r' },
      400,
    )

    const { code } = await runCli(['documents', 'list', INTEGRATION_ID, '--status', 'nope'], { env: ENV })

    expect(code).toBe(2)
  })

  it('maps a 429 to exit 7, marked retryable', async () => {
    const pool = setup()
    capture(
      pool,
      'GET',
      `${BASE}/${INTEGRATION_ID}/documents`,
      { type: 'RATE_LIMITED', message: 'Too many requests.', retryable: true, userActionRequired: false, requestId: 'r' },
      429,
    )

    const { code, stderr } = await runCli(['documents', 'list', INTEGRATION_ID, '--json'], { env: ENV })

    expect(code).toBe(7)
    expect(JSON.parse(stderr).error).toMatchObject({ code: 'RATE_LIMITED', retryable: true })
  })

  it('maps a 410 CURSOR_EXPIRED to exit 1', async () => {
    const pool = setup()
    capture(
      pool,
      'GET',
      `${BASE}/${INTEGRATION_ID}/documents`,
      { type: 'CURSOR_EXPIRED', message: 'Start again.', retryable: false, userActionRequired: false, requestId: 'r' },
      410,
    )

    const { code } = await runCli(['documents', 'list', INTEGRATION_ID, '--cursor', 'OLD'], { env: ENV })

    expect(code).toBe(1)
  })

  it('maps a bare gateway 401 to AUTH_FAILED after one re-mint', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    seedToken(pool)
    pool
      .intercept({ path: (p) => p.startsWith(`${BASE}/`), method: 'GET' })
      .reply(401, { message: 'Unauthorized' })
      .times(2)

    const { code, stderr } = await runCli(['integrations', 'list', '--json'], { env: ENV })

    expect(code).toBe(3)
    expect(JSON.parse(stderr).error.code).toBe('AUTH_FAILED')
  })

  it('maps an unshaped 5xx to API_UNAVAILABLE (exit 7)', async () => {
    const pool = setup()
    pool.intercept({ path: (p) => p.startsWith(`${BASE}/`), method: 'GET' }).reply(502, 'Bad Gateway')

    const { code, stderr } = await runCli(['integrations', 'list', '--json'], { env: ENV })

    expect(code).toBe(7)
    expect(JSON.parse(stderr).error.code).toBe('API_UNAVAILABLE')
  })
})

describe('a token minted before the key had integration access', () => {
  const scopeError = {
    type: 'INSUFFICIENT_SCOPE',
    message: 'This token was issued before the key was given integration access.',
    retryable: false,
    userActionRequired: true,
    requestId: 'r',
  }

  function countMints(pool: ReturnType<typeof mockApi>['pool'], times: number) {
    const counter = { mints: 0 }
    pool
      .intercept({ path: '/oauth/token', method: 'POST' })
      .reply(() => {
        counter.mints++
        return {
          statusCode: 200,
          data: JSON.stringify({ accessToken: makeJwt({ exp: Math.floor(Date.parse('2099-01-01') / 1000), n: counter.mints }) }),
        }
      })
      .times(times)
    return counter
  }

  it('re-mints once on INSUFFICIENT_SCOPE and succeeds with the fresh token', async () => {
    const { pool, close } = mockApi()
    teardown = close
    const counter = countMints(pool, 2)
    const seenTokens: string[] = []
    let calls = 0
    pool
      .intercept({ path: (p) => p.startsWith(`${BASE}/receivables`), method: 'GET' })
      .reply((opts) => {
        seenTokens.push((opts.headers as Record<string, string>).authorization!)
        calls++
        return calls === 1
          ? { statusCode: 403, data: JSON.stringify(scopeError) }
          : { statusCode: 200, data: JSON.stringify(receivables) }
      })
      .times(2)

    const { code, stdout } = await runCli(['receivables', '--json'], { env: ENV })

    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual({ data: receivables })
    expect(counter.mints).toBe(2)
    expect(seenTokens[0]).not.toBe(seenTokens[1])
  })

  it('retries exactly once, then explains the key has no integration access (exit 4)', async () => {
    const { pool, close } = mockApi()
    teardown = close
    const counter = countMints(pool, 2)
    let calls = 0
    pool
      .intercept({ path: (p) => p.startsWith(`${BASE}/receivables`), method: 'GET' })
      .reply(() => {
        calls++
        return { statusCode: 403, data: JSON.stringify(scopeError) }
      })
      .times(3)

    const { code, stderr } = await runCli(['receivables', '--json'], { env: ENV })

    expect(code).toBe(4)
    expect(calls).toBe(2)
    expect(counter.mints).toBe(2)
    const { error } = JSON.parse(stderr)
    expect(error.code).toBe('INSUFFICIENT_SCOPE')
    expect(error.message).toMatch(/doesn't have integration access/)
    expect(error.message).toMatch(/read-only/)
    expect(error.message).toMatch(/מידע בלבד/)
    expect(error.message).toMatch(/Starter/)
    expect(error.message).toMatch(/rotate/)
  })

  it('applies to drafts too, re-sending the same Idempotency-Key', async () => {
    const { pool, close } = mockApi()
    teardown = close
    countMints(pool, 2)
    const keys: string[] = []
    pool
      .intercept({ path: `${BASE}/${INTEGRATION_ID}/proposals`, method: 'POST' })
      .reply((opts) => {
        keys.push((opts.headers as Record<string, string>)['idempotency-key']!)
        return keys.length === 1
          ? { statusCode: 403, data: JSON.stringify(scopeError) }
          : { statusCode: 201, data: JSON.stringify({ proposal }) }
      })
      .times(2)
    const path = join(testConfigDir(), 'draft.json')
    writeFileSync(path, JSON.stringify(draftRequest))

    const { code } = await runCli(['proposals', 'create', INTEGRATION_ID, '--file', path, '--json'], { env: ENV })

    expect(code).toBe(0)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })
})

describe('financy customers', () => {
  it('lists customers with --search sent as q', async () => {
    const pool = setup()
    const seen = capture(pool, 'GET', `${BASE}/${INTEGRATION_ID}/customers`, {
      items: [customer],
      nextCursor: null,
      freshness,
    })

    const { code, stdout } = await runCli(['customers', 'list', INTEGRATION_ID, '--search', 'גל'], { env: ENV })

    expect(code).toBe(0)
    expect(query(seen[0]!.path).get('q')).toBe('גל')
    expect(stdout).toContain('סטודיו גל')
    expect(stdout).toContain(CUSTOMER_ID)
  })

  it('get returns the customer under {data}', async () => {
    const pool = setup()
    capture(pool, 'GET', `${BASE}/${INTEGRATION_ID}/customers/${CUSTOMER_ID}`, { customer, freshness, meta: {} })

    const { stdout } = await runCli(['customers', 'get', INTEGRATION_ID, CUSTOMER_ID, '--json'], { env: ENV })

    expect(JSON.parse(stdout)).toEqual({ data: customer, freshness })
  })
})

describe('financy settlements', () => {
  it('maps its filters to the settlements route and renders amounts from minor units', async () => {
    const pool = setup()
    const seen = capture(pool, 'GET', `${BASE}/${CLEARING_ID}/settlements`, {
      items: [settlementSettled],
      nextCursor: null,
      freshness,
    })

    const { code, stdout } = await runCli(
      ['settlements', 'list', CLEARING_ID, '--status', 'settled', '--from', '2026-10-01', '--to', '2026-10-31', '--limit', '20'],
      { env: ENV },
    )

    expect(code).toBe(0)
    const q = query(seen[0]!.path)
    expect(q.get('status')).toBe('settled')
    expect(q.get('paymentFrom')).toBe('2026-10-01')
    expect(q.get('paymentTo')).toBe('2026-10-31')
    expect(q.get('limit')).toBe('20')
    expect(stdout).toContain('₪12,500.00')
    expect(stdout).toContain('₪12,353.75')
    expect(stdout).toContain('1234')
  })

  it('sorts the table latest payment first, but keeps --json in API order', async () => {
    const pool = setup()
    pool
      .intercept({ path: (p) => p.startsWith(`${BASE}/${CLEARING_ID}/settlements`), method: 'GET' })
      .reply(200, { items: [settlementSettled, settlementExpected], nextCursor: null, freshness })
      .times(2)

    const table = await runCli(['settlements', 'list', CLEARING_ID], { env: ENV })
    const json = await runCli(['settlements', 'list', CLEARING_ID, '--json'], { env: ENV })

    expect(table.stdout.indexOf(settlementExpected.id)).toBeLessThan(table.stdout.indexOf(settlementSettled.id))
    expect(JSON.parse(json.stdout).data.map((s: { id: string }) => s.id)).toEqual([settlementSettled.id, settlementExpected.id])
  })

  it('refuses an id that is not id-shaped before calling the API', async () => {
    setup()
    const { code } = await runCli(['settlements', 'list', '../proposals'], { env: ENV })
    expect(code).toBe(2)
  })
})

describe('financy integrations with a clearing integration', () => {
  it('shows the category and the payouts sync for a clearing integration', async () => {
    const pool = setup()
    capture(pool, 'GET', `${BASE}/`, { items: [integration, clearingIntegration] })

    const { code, stdout } = await runCli(['integrations', 'list'], { env: ENV })

    expect(code).toBe(0)
    expect(stdout).toContain('clearing')
    expect(stdout).toContain('invoicing')
    expect(stdout).toContain('2026-10-18T05:00:00Z')
  })
})

describe('financy proposals', () => {
  it('lists drafts with filters mapped to the API query', async () => {
    const pool = setup()
    const seen = capture(pool, 'GET', `${BASE}/proposals`, { items: [proposal] })

    const { code, stdout } = await runCli(
      ['proposals', 'list', '--integration', INTEGRATION_ID, '--status', 'pending_approval', '--reference', 'order-17', '--limit', '10'],
      { env: ENV },
    )

    expect(code).toBe(0)
    const q = query(seen[0]!.path)
    expect(q.get('integrationId')).toBe(INTEGRATION_ID)
    expect(q.get('status')).toBe('pending_approval')
    expect(q.get('clientReference')).toBe('order-17')
    expect(q.get('limit')).toBe('10')
    expect(stdout).toContain(PROPOSAL_ID)
    expect(stdout).toContain('₪2,340.00')
  })

  it('get unwraps {proposal} into {data}', async () => {
    const pool = setup()
    capture(pool, 'GET', `${BASE}/proposals/${PROPOSAL_ID}`, { proposal })

    const { stdout } = await runCli(['proposals', 'get', PROPOSAL_ID, '--json'], { env: ENV })

    expect(JSON.parse(stdout)).toEqual({ data: proposal })
  })

  function draftFile(content: string): string {
    const path = join(testConfigDir(), 'draft.json')
    writeFileSync(path, content)
    return path
  }

  it('create posts the file body with an Idempotency-Key and prints the approval link', async () => {
    const pool = setup()
    const seen = capture(pool, 'POST', `${BASE}/${INTEGRATION_ID}/proposals`, { proposal }, 201)

    const { code, stdout } = await runCli(
      ['proposals', 'create', INTEGRATION_ID, '--file', draftFile(JSON.stringify(draftRequest))],
      { env: ENV },
    )

    expect(code).toBe(0)
    expect(JSON.parse(seen[0]!.body!)).toEqual(draftRequest)
    expect(seen[0]!.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(stdout).toContain(proposal.approvalUrl)
    expect(stdout).toMatch(/Nothing is issued until you approve it/)
  })

  it('create sends a caller-chosen key and reports a replay under --json', async () => {
    const { pool, close } = mockApi()
    teardown = close
    seedToken(pool)
    let key = ''
    pool.intercept({ path: `${BASE}/${INTEGRATION_ID}/proposals`, method: 'POST' }).reply((opts) => {
      key = (opts.headers as Record<string, string>)['idempotency-key']!
      return { statusCode: 201, data: JSON.stringify({ proposal }), responseOptions: { headers: { 'idempotent-replayed': 'true' } } }
    })

    const { code, stdout } = await runCli(
      ['proposals', 'create', INTEGRATION_ID, '--file', draftFile(JSON.stringify(draftRequest)), '--idempotency-key', 'order-17', '--json'],
      { env: ENV },
    )

    expect(code).toBe(0)
    expect(key).toBe('order-17')
    expect(JSON.parse(stdout)).toEqual({ data: proposal, replayed: true, idempotencyKey: 'order-17' })
  })

  it('create rejects a file that is not a draft request (exit 2, nothing sent)', async () => {
    setup()

    const { code, stderr } = await runCli(
      ['proposals', 'create', INTEGRATION_ID, '--file', draftFile('{"items": []}'), '--json'],
      { env: ENV },
    )

    expect(code).toBe(2)
    expect(JSON.parse(stderr).error.code).toBe('INVALID_DRAFT')
  })

  it('create rejects invalid JSON and a missing file', async () => {
    setup()

    const bad = await runCli(['proposals', 'create', INTEGRATION_ID, '--file', draftFile('{nope'), '--json'], { env: ENV })
    const missing = await runCli(
      ['proposals', 'create', INTEGRATION_ID, '--file', join(testConfigDir(), 'absent.json'), '--json'],
      { env: ENV },
    )

    expect(bad.code).toBe(2)
    expect(JSON.parse(bad.stderr).error.code).toBe('INVALID_DRAFT')
    expect(missing.code).toBe(2)
    expect(JSON.parse(missing.stderr).error.code).toBe('DRAFT_FILE_UNREADABLE')
  })

  it('create without --file is a usage error', async () => {
    const { code } = await runCli(['proposals', 'create', INTEGRATION_ID], { env: ENV })

    expect(code).toBe(2)
  })

  it('maps a 422 PROPOSAL_INVALID to exit 2 and a 409 to exit 1', async () => {
    const pool = setup()
    capture(
      pool,
      'POST',
      `${BASE}/${INTEGRATION_ID}/proposals`,
      { type: 'PROPOSAL_INVALID', message: 'The customer does not exist.', retryable: false, userActionRequired: false, requestId: 'r' },
      422,
    )
    const invalid = await runCli(
      ['proposals', 'create', INTEGRATION_ID, '--file', draftFile(JSON.stringify(draftRequest)), '--json'],
      { env: ENV },
    )
    expect(invalid.code).toBe(2)
    expect(JSON.parse(invalid.stderr).error.code).toBe('PROPOSAL_INVALID')

    seedToken(pool)
    capture(
      pool,
      'POST',
      `${BASE}/${INTEGRATION_ID}/proposals`,
      { type: 'IDEMPOTENCY_KEY_REUSED', message: 'That key was used for another request.', retryable: false, userActionRequired: false, requestId: 'r' },
      409,
    )
    const reused = await runCli(
      ['proposals', 'create', INTEGRATION_ID, '--file', draftFile(JSON.stringify(draftRequest)), '--json'],
      { env: ENV },
    )
    expect(reused.code).toBe(1)
    expect(JSON.parse(reused.stderr).error.code).toBe('IDEMPOTENCY_KEY_REUSED')
  })
})

describe('financy help lists the invoicing commands', () => {
  it('shows integrations, receivables, documents, customers and proposals', async () => {
    const { code, stdout } = await runCli(['help'])

    expect(code).toBe(0)
    for (const command of ['integrations', 'receivables', 'documents', 'customers', 'proposals']) {
      expect(stdout).toContain(command)
    }
  })
})
