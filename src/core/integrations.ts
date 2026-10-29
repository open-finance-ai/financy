import type { Config } from '../config.js'
import { authorized } from '../auth.js'
import type { Query } from '../api.js'
import { integrationsGet, integrationsPost } from '../integrations-api.js'
import { CliError } from '../errors.js'
import { EXIT } from '../exit-codes.js'
import type { ListArgs, ListEnvelope, GetEnvelope } from './read.js'

// --- Business-system integrations: invoicing (Invoice4U, Morning, SUMIT, iCount), ERP
// (Priority, Rivhit) and card clearing (Isracard Business). The single source of truth for paths + query
// mapping, shared by the CLI commands (src/commands/integration-commands.ts) and
// the local MCP server's tools. ---

interface CursorPage<T> {
  items?: T[]
  nextCursor?: string | null
  freshness?: unknown
}

/** The draft envelope: the proposal, whether the API replayed an earlier answer, and the key it was sent with. */
export interface DraftEnvelope<T> {
  data: T
  replayed: boolean
  idempotencyKey?: string
}

const PATH_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/

/** Ids are spliced into the URL path, so anything but an id-shaped token is refused before it can address another route. */
function segment(name: string, value: string): string {
  if (!PATH_SEGMENT.test(value)) {
    throw new CliError(EXIT.USAGE, 'INVALID_ARGUMENT', `'${value}' is not a valid ${name}`)
  }
  return value
}

const isScopeError = (error: CliError) => error.code === 'INSUFFICIENT_SCOPE'

/**
 * Authorize an integrations request. A token minted before the API key was given
 * integration access lacks the scope, so INSUFFICIENT_SCOPE re-mints once like a
 * 401; if the fresh token is refused too, the key itself has no access yet.
 */
async function integrationsAuthorized<T>(config: Config, now: Date, request: (token: string) => Promise<T>): Promise<T> {
  try {
    return await authorized(config, now, request, (e) => e.code === 'AUTH_FAILED' || isScopeError(e))
  } catch (error) {
    if (error instanceof CliError && isScopeError(error)) {
      throw new CliError(
        EXIT.PLAN,
        'INSUFFICIENT_SCOPE',
        "this API key doesn't have integration access — if the key is set to read-only, turn off " +
          '"מידע בלבד" (information only) in Financy → Settings → API access; otherwise integrations need a ' +
          'Starter plan or above, and the key may need refreshing: rotate it there, then run financy setup',
        error.extra,
      )
    }
    throw error
  }
}

const get = <T>(config: Config, now: Date, path: string, query: Query = {}) =>
  integrationsAuthorized(config, now, (token) => integrationsGet<T>(config, token, path, query))

/** One cursor page, or every page when `all`; `nextCursor` becomes the envelope's `nextPage`. */
async function cursorList<T>(
  config: Config,
  now: Date,
  path: string,
  query: Query,
  all: boolean,
): Promise<ListEnvelope<T>> {
  const data: T[] = []
  let cursor = query.cursor
  let freshness: unknown
  do {
    const page = await get<CursorPage<T>>(config, now, path, { ...query, cursor })
    data.push(...(Array.isArray(page.items) ? page.items : []))
    freshness = page.freshness
    cursor = page.nextCursor ?? undefined
  } while (all && cursor)
  return {
    data,
    count: data.length,
    nextPage: all ? null : (cursor ?? null),
    ...(freshness === undefined ? {} : { freshness }),
  }
}

export function fetchIntegrations<T>(config: Config, now: Date): Promise<ListEnvelope<T>> {
  return cursorList<T>(config, now, '/', {}, false)
}

export async function fetchIntegration<T>(config: Config, now: Date, id: string): Promise<GetEnvelope<T>> {
  const body = await get<{ integration: T }>(config, now, `/${segment('integration id', id)}`)
  return { data: body.integration }
}

export interface ReceivablesArgs {
  integrations?: string[]
  asOf?: string
  detailed?: boolean
  customerLimit?: string
  includeProforma?: boolean
}

/** Who owes what: open receivables with aging, per currency and per customer, across integrations. */
export async function fetchReceivables<T>(config: Config, now: Date, args: ReceivablesArgs): Promise<GetEnvelope<T>> {
  const ids = (args.integrations ?? []).flatMap((v) => v.split(',')).filter((v) => v.length > 0)
  const body = await get<T>(config, now, '/receivables', {
    integrationIds: ids.length > 0 ? ids.map((id) => segment('integration id', id)).join(',') : undefined,
    asOf: args.asOf,
    format: args.detailed ? 'detailed' : undefined,
    customerLimit: args.customerLimit,
    includeProforma: args.includeProforma === undefined ? undefined : String(args.includeProforma),
  })
  return { data: body }
}

export interface DocumentListArgs extends ListArgs {
  status?: string
  type?: string
  customer?: string
  from?: string
  to?: string
  receivableOnly?: boolean
  number?: string
}

export function fetchInvoicingDocuments<T>(
  config: Config,
  now: Date,
  integrationId: string,
  args: DocumentListArgs,
): Promise<ListEnvelope<T>> {
  return cursorList<T>(
    config,
    now,
    `/${segment('integration id', integrationId)}/documents`,
    {
      status: args.status,
      type: args.type,
      counterpartyId: args.customer,
      issuedFrom: args.from,
      issuedTo: args.to,
      receivableOnly: args.receivableOnly ? 'true' : undefined,
      number: args.number,
      limit: args.limit,
      cursor: args.cursor,
    },
    !!args.all,
  )
}

export async function fetchInvoicingDocument<T>(
  config: Config,
  now: Date,
  integrationId: string,
  documentId: string,
): Promise<GetEnvelope<T>> {
  const body = await get<{ document: T; freshness?: unknown }>(
    config,
    now,
    `/${segment('integration id', integrationId)}/documents/${segment('document id', documentId)}`,
  )
  return { data: body.document, ...(body.freshness === undefined ? {} : { freshness: body.freshness }) }
}

export interface CustomerListArgs extends ListArgs {
  search?: string
}

export function fetchInvoicingCustomers<T>(
  config: Config,
  now: Date,
  integrationId: string,
  args: CustomerListArgs,
): Promise<ListEnvelope<T>> {
  return cursorList<T>(
    config,
    now,
    `/${segment('integration id', integrationId)}/customers`,
    { q: args.search, limit: args.limit, cursor: args.cursor },
    !!args.all,
  )
}

export async function fetchInvoicingCustomer<T>(
  config: Config,
  now: Date,
  integrationId: string,
  customerId: string,
): Promise<GetEnvelope<T>> {
  const body = await get<{ customer: T; freshness?: unknown }>(
    config,
    now,
    `/${segment('integration id', integrationId)}/customers/${segment('customer id', customerId)}`,
  )
  return { data: body.customer, ...(body.freshness === undefined ? {} : { freshness: body.freshness }) }
}

export interface SettlementListArgs extends ListArgs {
  status?: string
  from?: string
  to?: string
}

/**
 * Card payouts of one clearing integration (Isracard Business): `expected` is a
 * future credit not yet in the bank, `settled` is already paid into the payout
 * account (and so already in that account's balance and transactions).
 */
export function fetchClearingSettlements<T>(
  config: Config,
  now: Date,
  integrationId: string,
  args: SettlementListArgs,
): Promise<ListEnvelope<T>> {
  return cursorList<T>(
    config,
    now,
    `/${segment('integration id', integrationId)}/settlements`,
    { status: args.status, paymentFrom: args.from, paymentTo: args.to, limit: args.limit, cursor: args.cursor },
    !!args.all,
  )
}

// --- ERP integrations (category erp: Priority, Rivhit). Read only: beside their
// documents and customers they hold suppliers, bills, the ledger, orders and
// inventory. Each route is per integration and pages with a cursor. ---

export interface PayablesArgs {
  asOf?: string
  detailed?: boolean
  supplierLimit?: string
}

/** What the business owes its suppliers on one ERP integration: open bills aged by due date, per currency and per supplier. */
export async function fetchPayables<T>(
  config: Config,
  now: Date,
  integrationId: string,
  args: PayablesArgs,
): Promise<GetEnvelope<T>> {
  const body = await get<T>(config, now, `/${segment('integration id', integrationId)}/payables`, {
    asOf: args.asOf,
    format: args.detailed ? 'detailed' : undefined,
    supplierLimit: args.supplierLimit,
  })
  return { data: body }
}

export interface SupplierListArgs extends ListArgs {
  search?: string
}

export function fetchSuppliers<T>(
  config: Config,
  now: Date,
  integrationId: string,
  args: SupplierListArgs,
): Promise<ListEnvelope<T>> {
  return cursorList<T>(
    config,
    now,
    `/${segment('integration id', integrationId)}/suppliers`,
    { q: args.search, limit: args.limit, cursor: args.cursor },
    !!args.all,
  )
}

export interface BillListArgs extends ListArgs {
  status?: string
  from?: string
  to?: string
  openOnly?: boolean
}

/** Supplier invoices (type bill) and supplier credits (type credit) of one ERP integration. */
export function fetchBills<T>(config: Config, now: Date, integrationId: string, args: BillListArgs): Promise<ListEnvelope<T>> {
  return cursorList<T>(
    config,
    now,
    `/${segment('integration id', integrationId)}/bills`,
    {
      status: args.status,
      issuedFrom: args.from,
      issuedTo: args.to,
      openOnly: args.openOnly ? 'true' : undefined,
      limit: args.limit,
      cursor: args.cursor,
    },
    !!args.all,
  )
}

export interface LedgerListArgs extends ListArgs {
  from?: string
  to?: string
  kind?: string
  account?: string
}

/** The general ledger of one ERP integration: one record per account and month (period YYYY-MM). */
export function fetchLedgerBalances<T>(
  config: Config,
  now: Date,
  integrationId: string,
  args: LedgerListArgs,
): Promise<ListEnvelope<T>> {
  return cursorList<T>(
    config,
    now,
    `/${segment('integration id', integrationId)}/ledger`,
    {
      periodFrom: args.from,
      periodTo: args.to,
      kind: args.kind,
      accountCode: args.account,
      limit: args.limit,
      cursor: args.cursor,
    },
    !!args.all,
  )
}

export interface OrderListArgs extends ListArgs {
  side?: string
  status?: string
  from?: string
  to?: string
}

/** Sales orders (revenue committed) and purchase orders (spend committed) of one ERP integration. */
export function fetchOrders<T>(config: Config, now: Date, integrationId: string, args: OrderListArgs): Promise<ListEnvelope<T>> {
  return cursorList<T>(
    config,
    now,
    `/${segment('integration id', integrationId)}/orders`,
    {
      side: args.side,
      status: args.status,
      orderedFrom: args.from,
      orderedTo: args.to,
      limit: args.limit,
      cursor: args.cursor,
    },
    !!args.all,
  )
}

export interface InventoryListArgs extends ListArgs {
  search?: string
  inStockOnly?: boolean
}

/** Stock items of one ERP integration: quantity on hand and value at cost. */
export function fetchInventory<T>(
  config: Config,
  now: Date,
  integrationId: string,
  args: InventoryListArgs,
): Promise<ListEnvelope<T>> {
  return cursorList<T>(
    config,
    now,
    `/${segment('integration id', integrationId)}/inventory`,
    {
      q: args.search,
      inStockOnly: args.inStockOnly ? 'true' : undefined,
      limit: args.limit,
      cursor: args.cursor,
    },
    !!args.all,
  )
}

export interface ProposalListArgs {
  integration?: string
  status?: string
  reference?: string
  limit?: string
}

/** Your own drafts, newest first. This route has no cursor; `limit` caps it (API maximum 50). */
export function fetchProposals<T>(config: Config, now: Date, args: ProposalListArgs): Promise<ListEnvelope<T>> {
  return cursorList<T>(
    config,
    now,
    '/proposals',
    {
      integrationId: args.integration === undefined ? undefined : segment('integration id', args.integration),
      status: args.status,
      clientReference: args.reference,
      limit: args.limit,
    },
    false,
  )
}

export async function fetchProposal<T>(config: Config, now: Date, id: string): Promise<GetEnvelope<T>> {
  const body = await get<{ proposal: T }>(config, now, `/proposals/${segment('proposal id', id)}`)
  return { data: body.proposal }
}

/** Reject a draft body that cannot be a proposal request before it costs a round trip. */
export function assertDraftBody(body: unknown): Record<string, unknown> {
  const obj = body as { action?: unknown; items?: unknown }
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof obj.action !== 'string' ||
    !Array.isArray(obj.items)
  ) {
    throw new CliError(
      EXIT.USAGE,
      'INVALID_DRAFT',
      'a draft is a JSON object with an "action" (e.g. "create_tax_invoice") and an "items" array',
    )
  }
  return body as Record<string, unknown>
}

/**
 * Create a DRAFT (a proposal pending approval). Nothing is issued: the document
 * is created in the business system only after the user approves the draft in
 * Financy at its `approvalUrl`. An Idempotency-Key makes a retry return the
 * first answer instead of a second draft.
 */
export async function createDraft<T>(
  config: Config,
  now: Date,
  integrationId: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<DraftEnvelope<T>> {
  const draft = assertDraftBody(body)
  const path = `/${segment('integration id', integrationId)}/proposals`
  const headers: Record<string, string> = idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}
  const res = await integrationsAuthorized(config, now, (token) =>
    integrationsPost<{ proposal: T }>(config, token, path, draft, headers),
  )
  return {
    data: res.body.proposal,
    replayed: res.replayed,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  }
}
