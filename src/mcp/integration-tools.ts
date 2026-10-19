import { CliError } from '../errors.js'
import { EXIT } from '../exit-codes.js'
import {
  fetchIntegrations,
  fetchIntegration,
  fetchReceivables,
  fetchInvoicingDocuments,
  fetchInvoicingDocument,
  fetchInvoicingCustomers,
  fetchInvoicingCustomer,
  fetchClearingSettlements,
  fetchProposals,
  fetchProposal,
  createDraft,
} from '../core/integrations.js'
import { TOOLS, dispatchTool, type CallToolIO, type JsonSchema, type ToolDef } from './tools.js'

/*
 * Business-system tools (invoicing and card clearing), served only by this CLI's own stdio server
 * (`financy mcp`). They are deliberately NOT part of the published `TOOLS` table:
 * hosts that import `TOOLS` from this package serve their own invoicing tools
 * under these same names, and adding them there would register every name twice.
 * Names, arguments and descriptions mirror those hosts so both surfaces read alike.
 */

const str = (v: unknown): string | undefined => (v == null ? undefined : String(v))
const bool = (v: unknown): boolean => v === true

function required(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new CliError(EXIT.USAGE, 'MISSING_ARGUMENT', `the \`${key}\` argument is required`)
  }
  return value
}

function selected(args: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => args[key] !== undefined).map((key) => [key, args[key]]))
}

// The merchant's number at the acquirer sits in `branch` and inside `providerId`; the
// integration id already stands for it, so neither reaches the model (as on the hosted server).
const SETTLEMENT_HIDDEN = new Set(['branch', 'providerId'])

function withoutMerchantNumber<T extends { data: unknown[] }>(envelope: T): T {
  return {
    ...envelope,
    data: envelope.data.map((item) =>
      item !== null && typeof item === 'object'
        ? Object.fromEntries(Object.entries(item).filter(([key]) => !SETTLEMENT_HIDDEN.has(key)))
        : item,
    ),
  }
}

function paymentOf(args: Record<string, unknown>): Record<string, unknown> {
  return {
    method: args.paymentMethod,
    date: args.paymentDate,
    ...(args.paymentReference === undefined ? {} : { reference: args.paymentReference }),
  }
}

const AMOUNTS = 'Amounts are integers in minor units of their currency (agorot for ILS).'
const DRAFT =
  'Create a document DRAFT. Nothing is issued by this call: the user must approve the draft in Financy at the returned approvalUrl, and only then is the document issued in their business system. Show the user the approvalUrl. ' +
  AMOUNTS
const PAGING_NOTE =
  'A page shorter than limit with a non-null nextPage means more may match: call again with that cursor, or pass all.'

const integrationId = { type: 'string', description: 'an integration id (intg_…) from list_integrations' }
const documentId = { type: 'string', description: 'a document id (idoc_…) from list_invoicing_documents' }
const counterpartyId = { type: 'string', description: 'a customer id (icus_…) from list_invoicing_customers' }
const proposalId = { type: 'string', description: 'a proposal id (prop_…) returned by a draft tool' }
const localDate = (description: string) => ({ type: 'string', description })
const PAGING = {
  limit: { type: 'number', description: 'page size (1–200)' },
  cursor: { type: 'string', description: 'opaque nextPage cursor from a prior call' },
  all: { type: 'boolean', description: 'auto-paginate to the end (ignores cursor/limit paging)' },
}
const recipients = {
  type: 'array',
  items: { type: 'string' },
  description: 'up to three email recipients; absent or empty sends no email',
}
const paymentProperties = {
  paymentMethod: { type: 'string', enum: ['bank_transfer', 'cash', 'cheque', 'card', 'other'] },
  paymentDate: localDate('payment date, YYYY-MM-DD'),
  paymentReference: { type: 'string', description: 'e.g. a transfer reference' },
}
const invoiceProperties = {
  integrationId,
  counterpartyId,
  lines: {
    type: 'array',
    description: '1–20 lines',
    items: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        quantity: { type: 'integer' },
        unitPriceMinor: { type: 'integer' },
      },
      required: ['description', 'quantity', 'unitPriceMinor'],
    },
  },
  pricesIncludeVat: { type: 'boolean' },
  dueDate: localDate('due date, YYYY-MM-DD'),
  recipients,
}
const invoiceRequired = ['integrationId', 'counterpartyId', 'lines', 'pricesIncludeVat']
const paymentRequired = ['paymentMethod', 'paymentDate']
const invoiceItemKeys = ['counterpartyId', 'lines', 'pricesIncludeVat', 'dueDate', 'recipients'] as const
const amountMinor = { type: 'integer', description: 'amount in minor units; omit for the full remaining amount' }

const schema = (properties: Record<string, unknown>, req?: string[]): JsonSchema => ({
  type: 'object',
  properties,
  ...(req ? { required: req } : {}),
})

const draft = (a: Record<string, unknown>, ctx: Parameters<ToolDef['run']>[1], body: unknown) =>
  createDraft(ctx.config, ctx.now, required(a, 'integrationId'), body)

export const INTEGRATION_TOOLS: ToolDef[] = [
  {
    name: 'list_integrations',
    description:
      "List the business systems connected to Financy, each with its category: invoicing (invoicing software such as Invoice4U, Morning, SUMIT or iCount, with documents and customers) or clearing (a card acquirer such as Isracard Business, with its payouts to the business). Each one has its connection health and sync state. Start here to find an integrationId.",
    inputSchema: schema({}),
    run: (_a, ctx) => fetchIntegrations(ctx.config, ctx.now),
  },
  {
    name: 'get_integration',
    description: 'Get one connected business system, invoicing or clearing: connection health, per-stream sync state and data freshness.',
    inputSchema: schema({ integrationId }, ['integrationId']),
    run: (a, ctx) => fetchIntegration(ctx.config, ctx.now, required(a, 'integrationId')),
  },
  {
    name: 'get_receivables',
    description: `Who owes the business money: open receivables across connected invoicing systems, with totals and aging buckets per currency and per customer. Each integration entry says how fresh its data is and whether its first sync is still running. Clearing integrations are left out: their card payouts (list_clearing_settlements) are different money, never part of receivables. ${AMOUNTS}`,
    inputSchema: schema({
      integrationIds: { type: 'array', items: integrationId, description: 'limit to these integrations (default: all)' },
      format: { type: 'string', enum: ['concise', 'detailed'], description: "detailed also lists each customer's open documents" },
      asOf: localDate('the date to age receivables against, YYYY-MM-DD (default today)'),
    }),
    run: (a, ctx) =>
      fetchReceivables(ctx.config, ctx.now, {
        integrations: Array.isArray(a.integrationIds) ? a.integrationIds.map(String) : undefined,
        detailed: a.format === 'detailed',
        asOf: str(a.asOf),
      }),
  },
  {
    name: 'list_invoicing_documents',
    description: `List documents (invoices, receipts, credit notes, proformas and others) of one connected business system, filtered by status, type, customer or issue date. ${PAGING_NOTE} ${AMOUNTS}`,
    inputSchema: schema(
      {
        integrationId,
        status: { type: 'string', enum: ['open', 'partially_paid', 'paid', 'partially_credited', 'credited', 'cancelled', 'closed', 'unknown'] },
        type: { type: 'string', enum: ['invoice', 'receipt', 'invoice_receipt', 'credit_note', 'proforma', 'quote', 'order', 'delivery_note', 'other'] },
        counterpartyId,
        issuedFrom: localDate('issued on or after, YYYY-MM-DD'),
        issuedTo: localDate('issued on or before, YYYY-MM-DD'),
        receivableOnly: { type: 'boolean', description: 'only documents that are owed money' },
        ...PAGING,
      },
      ['integrationId'],
    ),
    run: (a, ctx) =>
      fetchInvoicingDocuments(ctx.config, ctx.now, required(a, 'integrationId'), {
        status: str(a.status),
        type: str(a.type),
        customer: str(a.counterpartyId),
        from: str(a.issuedFrom),
        to: str(a.issuedTo),
        receivableOnly: bool(a.receivableOnly),
        limit: str(a.limit),
        cursor: str(a.cursor),
        all: bool(a.all),
      }),
  },
  {
    name: 'get_invoicing_document',
    description: `Get one invoicing document with its amounts, status, links to related documents and what remains owed. ${AMOUNTS}`,
    inputSchema: schema({ integrationId, documentId }, ['integrationId', 'documentId']),
    run: (a, ctx) =>
      fetchInvoicingDocument(ctx.config, ctx.now, required(a, 'integrationId'), required(a, 'documentId')),
  },
  {
    name: 'list_invoicing_customers',
    description: `List the customers of one connected business system, optionally matching part of the name. ${PAGING_NOTE}`,
    inputSchema: schema(
      { integrationId, q: { type: 'string', description: 'part of the customer name' }, ...PAGING },
      ['integrationId'],
    ),
    run: (a, ctx) =>
      fetchInvoicingCustomers(ctx.config, ctx.now, required(a, 'integrationId'), {
        search: str(a.q),
        limit: str(a.limit),
        cursor: str(a.cursor),
        all: bool(a.all),
      }),
  },
  {
    name: 'get_invoicing_customer',
    description: 'Get one customer of a connected business system by id (from list_invoicing_customers).',
    inputSchema: schema({ integrationId, counterpartyId }, ['integrationId', 'counterpartyId']),
    run: (a, ctx) =>
      fetchInvoicingCustomer(ctx.config, ctx.now, required(a, 'integrationId'), required(a, 'counterpartyId')),
  },
  {
    name: 'list_clearing_settlements',
    description: `List the card payouts of one connected clearing integration (Isracard Business), one record per payout (a payment date and currency), filtered by status or payment date. status expected: a future credit the acquirer will pay, not yet in the bank; one dated before today (Israel time) that never became settled is unconfirmed. status settled: already paid into the bank account ending in payoutAccount, so already part of that account's bank balance and transactions; never count it on top of them. Never add expected and settled amounts together, and never merge payouts with invoice receivables: they are different money. amounts: grossMinor, the deductions as positive numbers (commissionMinor, vatMinor, discountMinor, chargingFeeMinor, advanceRepaymentFeeMinor) and netMinor, which is gross minus all deductions; null is unknown. freshness.dataAsOf is when the payouts were last synced. Results are not in date order. ${PAGING_NOTE} ${AMOUNTS}`,
    inputSchema: schema(
      {
        integrationId,
        status: { type: 'string', enum: ['expected', 'settled'], description: 'expected (a future credit, not yet paid) or settled (already paid into the bank)' },
        paymentFrom: localDate('payment date on or after, YYYY-MM-DD'),
        paymentTo: localDate('payment date on or before, YYYY-MM-DD'),
        ...PAGING,
      },
      ['integrationId'],
    ),
    run: async (a, ctx) =>
      withoutMerchantNumber(
        await fetchClearingSettlements(ctx.config, ctx.now, required(a, 'integrationId'), {
          status: str(a.status),
          from: str(a.paymentFrom),
          to: str(a.paymentTo),
          limit: str(a.limit),
          cursor: str(a.cursor),
          all: bool(a.all),
        }),
      ),
  },
  {
    name: 'list_proposals',
    description:
      'List your document drafts, newest first, with their status (pending_approval until the user approves in Financy). Filter by integrationId or status; limit up to 50 (no cursor).',
    inputSchema: schema({
      integrationId,
      status: { type: 'string', enum: ['pending_approval', 'approved', 'executing', 'completed', 'partially_failed', 'failed', 'expired', 'cancelled'] },
      limit: { type: 'number', description: 'how many (1–50)' },
    }),
    run: (a, ctx) =>
      fetchProposals(ctx.config, ctx.now, {
        integration: str(a.integrationId),
        status: str(a.status),
        limit: str(a.limit),
      }),
  },
  {
    name: 'get_proposal',
    description:
      'Get a document draft, its approval link, previews and current status, including any issued document results once the user has approved it in Financy.',
    inputSchema: schema({ proposalId }, ['proposalId']),
    run: (a, ctx) => fetchProposal(ctx.config, ctx.now, required(a, 'proposalId')),
  },
  {
    name: 'draft_invoice',
    description: `${DRAFT} Drafts a tax invoice to an existing customer from list_invoicing_customers.`,
    inputSchema: schema(invoiceProperties, invoiceRequired),
    run: (a, ctx) => draft(a, ctx, { action: 'create_tax_invoice', items: [selected(a, invoiceItemKeys)] }),
  },
  {
    name: 'draft_invoice_receipt',
    description: `${DRAFT} Drafts an invoice-receipt, with its payment, to an existing customer from list_invoicing_customers.`,
    inputSchema: schema({ ...invoiceProperties, ...paymentProperties }, [...invoiceRequired, ...paymentRequired]),
    run: (a, ctx) =>
      draft(a, ctx, {
        action: 'create_invoice_receipt',
        items: [{ ...selected(a, invoiceItemKeys), payment: paymentOf(a) }],
      }),
  },
  {
    name: 'draft_receipt',
    description: `${DRAFT} Drafts a receipt against an existing invoice.`,
    inputSchema: schema(
      {
        integrationId,
        targetDocumentId: documentId,
        amountMinor,
        withholdingMinor: { type: 'integer', description: 'withholding tax at source, minor units' },
        ...paymentProperties,
        recipients,
      },
      ['integrationId', 'targetDocumentId', ...paymentRequired],
    ),
    run: (a, ctx) =>
      draft(a, ctx, {
        action: 'create_receipt',
        items: [{ ...selected(a, ['targetDocumentId', 'amountMinor', 'withholdingMinor', 'recipients']), payment: paymentOf(a) }],
      }),
  },
  {
    name: 'draft_credit_note',
    description: `${DRAFT} Drafts credit notes against existing invoices, each for at most what remains uncredited.`,
    inputSchema: schema(
      {
        integrationId,
        recipients,
        items: {
          type: 'array',
          description: '1–50 credit notes',
          items: {
            type: 'object',
            properties: { targetDocumentId: documentId, amountMinor, reason: { type: 'string' } },
            required: ['targetDocumentId'],
          },
        },
      },
      ['integrationId', 'items'],
    ),
    run: (a, ctx) =>
      draft(a, ctx, {
        action: 'create_credit_note',
        items: Array.isArray(a.items)
          ? a.items.map((item: unknown) => ({
              ...(item !== null && typeof item === 'object' ? item : {}),
              ...(a.recipients === undefined ? {} : { recipients: a.recipients }),
            }))
          : [],
      }),
  },
]

/** Everything `financy mcp` serves: the published table plus the invoicing tools. */
export const LOCAL_TOOLS: ToolDef[] = [...TOOLS, ...INTEGRATION_TOOLS]

const LOCAL_BY_NAME = new Map(LOCAL_TOOLS.map((t) => [t.name, t]))

/** `callTool` for the local stdio server, which also routes the invoicing tools. */
export function callLocalTool(
  name: string,
  args: Record<string, unknown>,
  io: CallToolIO,
): Promise<unknown> {
  return dispatchTool(LOCAL_BY_NAME, name, args, io)
}
