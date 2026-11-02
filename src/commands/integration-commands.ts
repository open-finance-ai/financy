import type { Command } from 'commander'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { CliError } from '../errors.js'
import { EXIT } from '../exit-codes.js'
import { renderTable, type Column } from '../render.js'
import {
  fetchIntegrations,
  fetchIntegration,
  fetchReceivables,
  fetchInvoicingDocuments,
  fetchInvoicingDocument,
  fetchInvoicingCustomers,
  fetchInvoicingCustomer,
  fetchClearingSettlements,
  fetchPayables,
  fetchSuppliers,
  fetchBills,
  fetchLedgerBalances,
  fetchOrders,
  fetchInventory,
  fetchProposals,
  fetchProposal,
  createDraft,
} from '../core/integrations.js'
import { renderList, renderGet, type RenderContext } from './resources.js'
import { loadOrThrow, dash, type ReadBase } from './read-commands.js'

const SYMBOLS: Record<string, string> = { ILS: '₪', USD: '$', EUR: '€', GBP: '£' }

/** Integer minor units (agorot for ILS) → a display amount; non-numbers become an em dash. */
export const money = (minor: unknown, currency: unknown = 'ILS'): string => {
  if (typeof minor !== 'number' || !Number.isFinite(minor)) return '—'
  const code = typeof currency === 'string' ? currency : 'ILS'
  const symbol = SYMBOLS[code] ?? `${code} `
  const major = Math.abs(minor) / 100
  return (minor < 0 ? '-' : '') + symbol + major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// --- Row shapes: the subset of the integrations API views the tables read. All
// optional; --json emits the API objects verbatim. ---

interface StreamSync {
  state?: string
  lastSuccessAt?: string | null
}

interface Integration {
  id: string
  connectorName?: string
  category?: string
  label?: string
  auth?: { state?: string; attention?: { message?: string } | null }
  sync?: { documents?: StreamSync; settlements?: StreamSync }
  externalAiApps?: string
}

/** The stream that says whether an integration is current: documents for invoicing, payouts for clearing. */
const primarySync = (i: Integration): StreamSync | undefined => i.sync?.documents ?? i.sync?.settlements

interface InvoicingDocument {
  id: string
  type?: string
  number?: string | null
  issueDate?: string
  status?: string
  currency?: string
  counterparty?: { name?: string | null }
  amounts?: { grossMinor?: number | null }
  receivable?: { remainingMinor?: number }
}

interface InvoicingCustomer {
  id: string
  name?: string
  businessTaxId?: string | null
  active?: boolean
}

interface Settlement {
  id: string
  status?: string
  paymentDate?: string
  payoutAccount?: string | null
  currency?: string
  amounts?: { grossMinor?: number | null; netMinor?: number | null }
}

// --- ERP rows (Priority, Rivhit) ---

interface Supplier {
  id: string
  name?: string
  businessTaxId?: string | null
  active?: boolean
}

interface Bill {
  id: string
  type?: string
  number?: string | null
  issueDate?: string
  dueDate?: string | null
  supplier?: { name?: string | null }
  currency?: string
  amounts?: { grossMinor?: number | null; paidMinor?: number | null }
  status?: string
}

interface LedgerBalance {
  id: string
  account?: { code?: string; name?: string; kind?: string }
  period?: string
  currency?: string
  debitMinor?: number
  creditMinor?: number
  closingMinor?: number
}

interface Order {
  id: string
  side?: string
  number?: string
  orderDate?: string
  dueDate?: string | null
  counterparty?: { name?: string | null }
  currency?: string
  amounts?: { grossMinor?: number | null }
  status?: string
}

interface InventoryItem {
  id: string
  sku?: string
  name?: string
  unit?: string | null
  quantityOnHand?: number
  unitCostMinor?: number | null
  valueMinor?: number | null
  currency?: string
}

interface SupplierPayables {
  supplier?: { id?: string | null; name?: string | null }
  currency?: string
  openMinor?: number
  overdueMinor?: number
  billCount?: number
  oldestDueDate?: string | null
  maxDaysPastDue?: number
}

interface Payables {
  asOf?: string
  freshness?: { dataAsOf?: string | null; stale?: boolean }
  byCurrency?: Array<{ currency?: string; totals?: { openMinor?: number; overdueMinor?: number; billCount?: number } }>
  suppliers?: SupplierPayables[]
  truncated?: { suppliersShown?: number; suppliersTotal?: number }
}

interface Proposal {
  id: string
  action?: string
  status?: string
  createdAt?: string
  expiresAt?: string
  approvalUrl?: string
  items?: unknown[]
  totals?: { count?: number; grossMinor?: number; currency?: string }
}

interface CustomerReceivable {
  counterparty?: { id?: string | null; name?: string | null }
  currency?: string
  openMinor?: number
  overdueMinor?: number
  documentCount?: number
  maxDaysPastDue?: number
}

interface Receivables {
  asOf?: string
  integrations?: Array<{ integrationId?: string; ready?: string; stale?: boolean; dataAsOf?: string | null }>
  byCurrency?: Array<{ currency?: string; totals?: { openMinor?: number; overdueMinor?: number; documentCount?: number } }>
  customers?: CustomerReceivable[]
  truncated?: { customersShown?: number; customersTotal?: number }
}

const INTEGRATION_COLUMNS: Column<Integration>[] = [
  { header: 'ID', value: (i) => i.id },
  { header: 'SYSTEM', value: (i) => dash(i.connectorName) },
  { header: 'CATEGORY', value: (i) => dash(i.category) },
  { header: 'LABEL', value: (i) => dash(i.label) },
  { header: 'AUTH', value: (i) => dash(i.auth?.state) },
  { header: 'SYNC', value: (i) => dash(primarySync(i)?.state) },
  { header: 'SYNCED AT', value: (i) => dash(primarySync(i)?.lastSuccessAt) },
]

const DOCUMENT_COLUMNS: Column<InvoicingDocument>[] = [
  { header: 'ISSUED', value: (d) => dash(d.issueDate) },
  { header: 'TYPE', value: (d) => dash(d.type) },
  { header: 'NUMBER', value: (d) => dash(d.number) },
  { header: 'CUSTOMER', value: (d) => dash(d.counterparty?.name) },
  { header: 'GROSS', value: (d) => money(d.amounts?.grossMinor, d.currency) },
  { header: 'OWED', value: (d) => money(d.receivable?.remainingMinor, d.currency) },
  { header: 'STATUS', value: (d) => dash(d.status) },
  { header: 'ID', value: (d) => d.id },
]

/** Table order for documents: newest issue date first, ties by document number descending (numeric-aware). */
export function newestFirst(a: InvoicingDocument, b: InvoicingDocument): number {
  const byDate = (b.issueDate ?? '').localeCompare(a.issueDate ?? '')
  if (byDate !== 0) return byDate
  return (b.number ?? '').localeCompare(a.number ?? '', 'en', { numeric: true })
}

const CUSTOMER_COLUMNS: Column<InvoicingCustomer>[] = [
  { header: 'ID', value: (c) => c.id },
  { header: 'NAME', value: (c) => dash(c.name) },
  { header: 'TAX ID', value: (c) => dash(c.businessTaxId) },
  { header: 'ACTIVE', value: (c) => (c.active === false ? 'no' : 'yes') },
]

const SETTLEMENT_COLUMNS: Column<Settlement>[] = [
  { header: 'PAYMENT DATE', value: (s) => dash(s.paymentDate) },
  { header: 'STATUS', value: (s) => dash(s.status) },
  { header: 'GROSS', value: (s) => money(s.amounts?.grossMinor, s.currency) },
  { header: 'NET', value: (s) => money(s.amounts?.netMinor, s.currency) },
  { header: 'TO ACCOUNT', value: (s) => dash(s.payoutAccount) },
  { header: 'ID', value: (s) => s.id },
]

/** Table order for payouts: latest payment date first, like the documents table. */
export function latestPaymentFirst(a: Settlement, b: Settlement): number {
  return (b.paymentDate ?? '').localeCompare(a.paymentDate ?? '')
}

const SUPPLIER_COLUMNS: Column<Supplier>[] = [
  { header: 'ID', value: (s) => s.id },
  { header: 'NAME', value: (s) => dash(s.name) },
  { header: 'TAX ID', value: (s) => dash(s.businessTaxId) },
  { header: 'ACTIVE', value: (s) => (s.active === false ? 'no' : 'yes') },
]

const BILL_COLUMNS: Column<Bill>[] = [
  { header: 'ISSUED', value: (b) => dash(b.issueDate) },
  { header: 'DUE', value: (b) => dash(b.dueDate) },
  { header: 'TYPE', value: (b) => dash(b.type) },
  { header: 'NUMBER', value: (b) => dash(b.number) },
  { header: 'SUPPLIER', value: (b) => dash(b.supplier?.name) },
  { header: 'GROSS', value: (b) => money(b.amounts?.grossMinor, b.currency) },
  { header: 'PAID', value: (b) => money(b.amounts?.paidMinor, b.currency) },
  { header: 'STATUS', value: (b) => dash(b.status) },
  { header: 'ID', value: (b) => b.id },
]

const LEDGER_COLUMNS: Column<LedgerBalance>[] = [
  { header: 'PERIOD', value: (l) => dash(l.period) },
  { header: 'CODE', value: (l) => dash(l.account?.code) },
  { header: 'ACCOUNT', value: (l) => dash(l.account?.name) },
  { header: 'KIND', value: (l) => dash(l.account?.kind) },
  { header: 'DEBIT', value: (l) => money(l.debitMinor, l.currency) },
  { header: 'CREDIT', value: (l) => money(l.creditMinor, l.currency) },
  { header: 'CLOSING', value: (l) => money(l.closingMinor, l.currency) },
]

const ORDER_COLUMNS: Column<Order>[] = [
  { header: 'ORDERED', value: (o) => dash(o.orderDate) },
  { header: 'SIDE', value: (o) => dash(o.side) },
  { header: 'NUMBER', value: (o) => dash(o.number) },
  { header: 'COUNTERPARTY', value: (o) => dash(o.counterparty?.name) },
  { header: 'GROSS', value: (o) => money(o.amounts?.grossMinor, o.currency) },
  { header: 'STATUS', value: (o) => dash(o.status) },
  { header: 'DUE', value: (o) => dash(o.dueDate) },
  { header: 'ID', value: (o) => o.id },
]

const INVENTORY_COLUMNS: Column<InventoryItem>[] = [
  { header: 'SKU', value: (i) => dash(i.sku) },
  { header: 'NAME', value: (i) => dash(i.name) },
  { header: 'ON HAND', value: (i) => dash(i.quantityOnHand) },
  { header: 'UNIT', value: (i) => dash(i.unit) },
  { header: 'UNIT COST', value: (i) => money(i.unitCostMinor, i.currency) },
  { header: 'VALUE', value: (i) => money(i.valueMinor, i.currency) },
  { header: 'ID', value: (i) => i.id },
]

const PAYABLE_COLUMNS: Column<SupplierPayables>[] = [
  { header: 'SUPPLIER', value: (s) => dash(s.supplier?.name) },
  { header: 'OPEN', value: (s) => money(s.openMinor, s.currency) },
  { header: 'OVERDUE', value: (s) => money(s.overdueMinor, s.currency) },
  { header: 'BILLS', value: (s) => dash(s.billCount) },
  { header: 'OLDEST DUE', value: (s) => dash(s.oldestDueDate) },
  { header: 'MAX DAYS LATE', value: (s) => dash(s.maxDaysPastDue) },
  { header: 'SUPPLIER ID', value: (s) => dash(s.supplier?.id) },
]

/** Table order for bills and orders: newest date first, ties by number descending (numeric-aware). */
const byDateThenNumber =
  <T extends { number?: string | null }>(date: (row: T) => string | undefined) =>
  (a: T, b: T): number => {
    const byDate = (date(b) ?? '').localeCompare(date(a) ?? '')
    if (byDate !== 0) return byDate
    return (b.number ?? '').localeCompare(a.number ?? '', 'en', { numeric: true })
  }
export const newestBillFirst = byDateThenNumber<Bill>((b) => b.issueDate)
export const newestOrderFirst = byDateThenNumber<Order>((o) => o.orderDate)

/** Table order for the ledger: latest month first, then by account code (numeric-aware). */
export function ledgerOrder(a: LedgerBalance, b: LedgerBalance): number {
  const byPeriod = (b.period ?? '').localeCompare(a.period ?? '')
  if (byPeriod !== 0) return byPeriod
  return (a.account?.code ?? '').localeCompare(b.account?.code ?? '', 'en', { numeric: true })
}

/** The payables view: totals per currency, a per-supplier table (most overdue first, as the API sends it) and a stale-data note. */
export function renderPayables(p: Payables): string {
  const lines: string[] = [`Payables as of ${dash(p.asOf)}`]
  for (const c of p.byCurrency ?? []) {
    lines.push(
      `  ${dash(c.currency)}: ${money(c.totals?.openMinor, c.currency)} open, ` +
        `${money(c.totals?.overdueMinor, c.currency)} overdue across ${dash(c.totals?.billCount)} bills`,
    )
  }
  if ((p.byCurrency ?? []).length === 0) lines.push('  Nothing is owed to suppliers.')
  let out = lines.join('\n') + '\n'
  const suppliers = p.suppliers ?? []
  if (suppliers.length > 0) out += '\n' + renderTable(suppliers, PAYABLE_COLUMNS)
  const shown = p.truncated?.suppliersShown
  const total = p.truncated?.suppliersTotal
  if (typeof shown === 'number' && typeof total === 'number' && shown < total) {
    out += `\nShowing ${shown} of ${total} suppliers — raise --supplier-limit to see more.\n`
  }
  if (p.freshness?.stale) out += `Note: the bills are stale (last synced ${dash(p.freshness.dataAsOf)}).\n`
  return out
}

const PROPOSAL_COLUMNS: Column<Proposal>[] = [
  { header: 'ID', value: (p) => p.id },
  { header: 'ACTION', value: (p) => dash(p.action) },
  { header: 'STATUS', value: (p) => dash(p.status) },
  { header: 'ITEMS', value: (p) => dash(p.totals?.count ?? p.items?.length) },
  { header: 'TOTAL', value: (p) => money(p.totals?.grossMinor, p.totals?.currency) },
  { header: 'CREATED', value: (p) => dash(p.createdAt) },
  { header: 'EXPIRES', value: (p) => dash(p.expiresAt) },
]

const RECEIVABLE_COLUMNS: Column<CustomerReceivable>[] = [
  { header: 'CUSTOMER', value: (c) => dash(c.counterparty?.name) },
  { header: 'OPEN', value: (c) => money(c.openMinor, c.currency) },
  { header: 'OVERDUE', value: (c) => money(c.overdueMinor, c.currency) },
  { header: 'DOCS', value: (c) => dash(c.documentCount) },
  { header: 'MAX DAYS LATE', value: (c) => dash(c.maxDaysPastDue) },
  { header: 'CUSTOMER ID', value: (c) => dash(c.counterparty?.id) },
]

/** The receivables view: totals per currency, a per-customer table, and a note for any integration still syncing or stale. */
export function renderReceivables(r: Receivables): string {
  const lines: string[] = [`Receivables as of ${dash(r.asOf)}`]
  for (const c of r.byCurrency ?? []) {
    lines.push(
      `  ${dash(c.currency)}: ${money(c.totals?.openMinor, c.currency)} open, ` +
        `${money(c.totals?.overdueMinor, c.currency)} overdue across ${dash(c.totals?.documentCount)} documents`,
    )
  }
  if ((r.byCurrency ?? []).length === 0) lines.push('  Nothing is owed.')
  let out = lines.join('\n') + '\n'
  const customers = r.customers ?? []
  if (customers.length > 0) out += '\n' + renderTable(customers, RECEIVABLE_COLUMNS)
  const shown = r.truncated?.customersShown
  const total = r.truncated?.customersTotal
  if (typeof shown === 'number' && typeof total === 'number' && shown < total) {
    out += `\nShowing ${shown} of ${total} customers — raise --customer-limit to see more.\n`
  }
  for (const i of r.integrations ?? []) {
    if (i.ready === 'pending') {
      out += `Note: ${dash(i.integrationId)} is still running its first sync — totals are incomplete.\n`
    } else if (i.stale) {
      out += `Note: ${dash(i.integrationId)} data is stale (last synced ${dash(i.dataAsOf)}).\n`
    }
  }
  return out
}

/** The draft confirmation: what was drafted, where to approve it, and that nothing is issued until then. */
export function renderDraft(p: Proposal, replayed: boolean): string {
  const count = p.totals?.count ?? p.items?.length
  return [
    `Draft ${p.id} created${replayed ? ' (replayed — the same draft as the first request)' : ''} — status ${dash(p.status)}.`,
    `  ${dash(p.action)} · ${dash(count)} item${count === 1 ? '' : 's'} · ${money(p.totals?.grossMinor, p.totals?.currency)}`,
    '',
    `  Approve it in Financy: ${dash(p.approvalUrl)}`,
    `  Nothing is issued until you approve it there. The draft expires ${dash(p.expiresAt)}.`,
  ].join('\n') + '\n'
}

async function readDraftFile(path: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    throw new CliError(
      EXIT.USAGE,
      'DRAFT_FILE_UNREADABLE',
      `could not read ${path}: ${(error as { code?: string }).code ?? String(error)}`,
    )
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch (error) {
    throw new CliError(EXIT.USAGE, 'INVALID_DRAFT', `${path} is not valid JSON (${(error as Error).message})`)
  }
}

interface PagingOpts {
  limit?: string
  cursor?: string
  all?: boolean
}

interface DocumentOpts extends PagingOpts {
  status?: string
  type?: string
  customer?: string
  from?: string
  to?: string
  receivableOnly?: boolean
  number?: string
}

/** Help-text note on every ERP command: which systems hold these streams and on what terms. */
const ERP_NOTE = 'ERP integrations only: Priority, Rivhit (Pro and up, read only, beta)'

/** Register the business-system integration commands (integrations, receivables, documents, customers, settlements, ERP reads, proposals). */
export function registerIntegrationCommands(
  program: Command,
  base: ReadBase,
  setExit: (code: number) => void,
): void {
  const ctx: RenderContext = { json: base.json, out: base.out }

  // --- integrations ---
  const integrations = program
    .command('integrations')
    .description(
      'Connected business systems (invoicing: Invoice4U, Morning, SUMIT, iCount; ERP: Priority, Rivhit; clearing: Isracard Business)',
    )
  integrations
    .command('list')
    .option('--json', 'machine-readable output')
    .action(async () => {
      const config = await loadOrThrow(base.env)
      setExit(renderList(ctx, await fetchIntegrations<Integration>(config, base.now), INTEGRATION_COLUMNS))
    })
  integrations
    .command('get <integrationId>')
    .option('--json', 'machine-readable output')
    .action(async (id: string) => {
      const config = await loadOrThrow(base.env)
      setExit(renderGet(ctx, await fetchIntegration<Integration>(config, base.now, id)))
    })

  // --- receivables ---
  program
    .command('receivables')
    .description('Who owes you what: open and overdue invoices, aged per customer')
    .option('--integration <ids>', 'limit to these integration ids (comma-separated)')
    .option('--as-of <date>', 'age receivables against this date (YYYY-MM-DD, default today)')
    .option('--detailed', "also list each customer's open documents")
    .option('--customer-limit <n>', 'how many customers to return (max 200)')
    .option('--include-proforma', 'count open proforma invoices too')
    .option('--json', 'machine-readable output')
    .action(
      async (opts: {
        integration?: string
        asOf?: string
        detailed?: boolean
        customerLimit?: string
        includeProforma?: boolean
      }) => {
        const config = await loadOrThrow(base.env)
        const envelope = await fetchReceivables<Receivables>(config, base.now, {
          integrations: opts.integration ? [opts.integration] : undefined,
          asOf: opts.asOf,
          detailed: opts.detailed,
          customerLimit: opts.customerLimit,
          includeProforma: opts.includeProforma,
        })
        base.out(base.json ? JSON.stringify(envelope, null, 2) : renderReceivables(envelope.data))
        setExit(EXIT.OK)
      },
    )

  // --- documents ---
  const documents = program
    .command('documents')
    .description('Invoices, receipts and credit notes in a connected business system')
  documents
    .command('list <integrationId>')
    .option('--status <status>', 'open|partially_paid|paid|partially_credited|credited|cancelled|closed|unknown')
    .option('--type <type>', 'invoice|receipt|invoice_receipt|credit_note|proforma|quote|order|delivery_note|other')
    .option('--customer <customerId>', 'filter to one customer (icus_… from customers list)')
    .option('--from <date>', 'issued on or after (YYYY-MM-DD)')
    .option('--to <date>', 'issued on or before (YYYY-MM-DD)')
    .option('--receivable-only', 'only documents that are still owed money')
    .option('--number <number>', 'the document number')
    .option('--limit <n>', 'page size (max 200)')
    .option('--cursor <token>', 'resume from a nextPage cursor')
    .option('--all', 'auto-paginate to the end')
    .option('--json', 'machine-readable output')
    .action(async (integrationId: string, opts: DocumentOpts) => {
      const config = await loadOrThrow(base.env)
      const envelope = await fetchInvoicingDocuments<InvoicingDocument>(config, base.now, integrationId, opts)
      const rows = base.json ? envelope : { ...envelope, data: [...envelope.data].sort(newestFirst) }
      setExit(renderList(ctx, rows, DOCUMENT_COLUMNS))
    })
  documents
    .command('get <integrationId> <documentId>')
    .option('--json', 'machine-readable output')
    .action(async (integrationId: string, documentId: string) => {
      const config = await loadOrThrow(base.env)
      setExit(renderGet(ctx, await fetchInvoicingDocument(config, base.now, integrationId, documentId)))
    })

  // --- customers ---
  const customers = program
    .command('customers')
    .description('Customers in a connected business system')
  customers
    .command('list <integrationId>')
    .option('--search <text>', 'part of the customer name')
    .option('--limit <n>', 'page size (max 200)')
    .option('--cursor <token>', 'resume from a nextPage cursor')
    .option('--all', 'auto-paginate to the end')
    .option('--json', 'machine-readable output')
    .action(async (integrationId: string, opts: PagingOpts & { search?: string }) => {
      const config = await loadOrThrow(base.env)
      const envelope = await fetchInvoicingCustomers<InvoicingCustomer>(config, base.now, integrationId, opts)
      setExit(renderList(ctx, envelope, CUSTOMER_COLUMNS))
    })
  customers
    .command('get <integrationId> <customerId>')
    .option('--json', 'machine-readable output')
    .action(async (integrationId: string, customerId: string) => {
      const config = await loadOrThrow(base.env)
      setExit(renderGet(ctx, await fetchInvoicingCustomer(config, base.now, integrationId, customerId)))
    })

  // --- settlements (card clearing payouts) ---
  const settlements = program
    .command('settlements')
    .description('Card payouts from a clearing integration (Isracard Business): expected and settled')
  settlements
    .command('list <integrationId>')
    .option('--status <status>', 'expected (a future credit, not yet in the bank) | settled (already paid into the bank)')
    .option('--from <date>', 'payment date on or after (YYYY-MM-DD)')
    .option('--to <date>', 'payment date on or before (YYYY-MM-DD)')
    .option('--limit <n>', 'page size (max 200)')
    .option('--cursor <token>', 'resume from a nextPage cursor')
    .option('--all', 'auto-paginate to the end')
    .option('--json', 'machine-readable output')
    .action(async (integrationId: string, opts: PagingOpts & { status?: string; from?: string; to?: string }) => {
      const config = await loadOrThrow(base.env)
      const envelope = await fetchClearingSettlements<Settlement>(config, base.now, integrationId, opts)
      const rows = base.json ? envelope : { ...envelope, data: [...envelope.data].sort(latestPaymentFirst) }
      setExit(renderList(ctx, rows, SETTLEMENT_COLUMNS))
    })

  // --- ERP reads (Priority, Rivhit): payables, suppliers, bills, ledger, orders, inventory ---
  program
    .command('payables <integrationId>')
    .description(`What you owe suppliers: open bills aged by due date, per supplier. ${ERP_NOTE}`)
    .option('--as-of <date>', 'age the bills against this date (YYYY-MM-DD, default today)')
    .option('--detailed', "also list each supplier's open bills")
    .option('--supplier-limit <n>', 'how many suppliers to return (max 200)')
    .option('--json', 'machine-readable output')
    .action(async (integrationId: string, opts: { asOf?: string; detailed?: boolean; supplierLimit?: string }) => {
      const config = await loadOrThrow(base.env)
      const envelope = await fetchPayables<Payables>(config, base.now, integrationId, opts)
      base.out(base.json ? JSON.stringify(envelope, null, 2) : renderPayables(envelope.data))
      setExit(EXIT.OK)
    })

  const suppliers = program
    .command('suppliers')
    .description(`Suppliers in a connected ERP. ${ERP_NOTE}`)
  suppliers
    .command('list <integrationId>')
    .option('--search <text>', 'part of the supplier name')
    .option('--limit <n>', 'page size (max 200)')
    .option('--cursor <token>', 'resume from a nextPage cursor')
    .option('--all', 'auto-paginate to the end')
    .option('--json', 'machine-readable output')
    .action(async (integrationId: string, opts: PagingOpts & { search?: string }) => {
      const config = await loadOrThrow(base.env)
      setExit(renderList(ctx, await fetchSuppliers<Supplier>(config, base.now, integrationId, opts), SUPPLIER_COLUMNS))
    })

  const bills = program
    .command('bills')
    .description(`Supplier invoices and supplier credits in a connected ERP. ${ERP_NOTE}`)
  bills
    .command('list <integrationId>')
    .option('--status <status>', 'open|partially_paid|paid|cancelled|closed')
    .option('--from <date>', 'issued on or after (YYYY-MM-DD)')
    .option('--to <date>', 'issued on or before (YYYY-MM-DD)')
    .option('--open-only', 'only bills still (partly) unpaid')
    .option('--limit <n>', 'page size (max 200)')
    .option('--cursor <token>', 'resume from a nextPage cursor')
    .option('--all', 'auto-paginate to the end')
    .option('--json', 'machine-readable output')
    .action(
      async (integrationId: string, opts: PagingOpts & { status?: string; from?: string; to?: string; openOnly?: boolean }) => {
        const config = await loadOrThrow(base.env)
        const envelope = await fetchBills<Bill>(config, base.now, integrationId, opts)
        const rows = base.json ? envelope : { ...envelope, data: [...envelope.data].sort(newestBillFirst) }
        setExit(renderList(ctx, rows, BILL_COLUMNS))
      },
    )

  const ledger = program
    .command('ledger')
    .description(`General ledger balances by account and month in a connected ERP. ${ERP_NOTE}`)
  ledger
    .command('list <integrationId>')
    .option('--from <month>', 'first month (YYYY-MM)')
    .option('--to <month>', 'last month (YYYY-MM)')
    .option('--kind <kind>', 'asset|liability|equity|income|expense|unknown')
    .option('--account <code>', 'one account code')
    .option('--limit <n>', 'page size (max 200)')
    .option('--cursor <token>', 'resume from a nextPage cursor')
    .option('--all', 'auto-paginate to the end')
    .option('--json', 'machine-readable output')
    .action(
      async (integrationId: string, opts: PagingOpts & { from?: string; to?: string; kind?: string; account?: string }) => {
        const config = await loadOrThrow(base.env)
        const envelope = await fetchLedgerBalances<LedgerBalance>(config, base.now, integrationId, opts)
        const rows = base.json ? envelope : { ...envelope, data: [...envelope.data].sort(ledgerOrder) }
        setExit(renderList(ctx, rows, LEDGER_COLUMNS))
      },
    )

  const orders = program
    .command('orders')
    .description(`Sales and purchase orders in a connected ERP. ${ERP_NOTE}`)
  orders
    .command('list <integrationId>')
    .option('--side <side>', 'sales (revenue committed) | purchase (spend committed)')
    .option('--status <status>', 'open|partially_fulfilled|fulfilled|cancelled|closed')
    .option('--from <date>', 'ordered on or after (YYYY-MM-DD)')
    .option('--to <date>', 'ordered on or before (YYYY-MM-DD)')
    .option('--limit <n>', 'page size (max 200)')
    .option('--cursor <token>', 'resume from a nextPage cursor')
    .option('--all', 'auto-paginate to the end')
    .option('--json', 'machine-readable output')
    .action(
      async (integrationId: string, opts: PagingOpts & { side?: string; status?: string; from?: string; to?: string }) => {
        const config = await loadOrThrow(base.env)
        const envelope = await fetchOrders<Order>(config, base.now, integrationId, opts)
        const rows = base.json ? envelope : { ...envelope, data: [...envelope.data].sort(newestOrderFirst) }
        setExit(renderList(ctx, rows, ORDER_COLUMNS))
      },
    )

  const inventory = program
    .command('inventory')
    .description(`Stock on hand and its value at cost in a connected ERP. ${ERP_NOTE}`)
  inventory
    .command('list <integrationId>')
    .option('--search <text>', 'part of the item name or SKU')
    .option('--in-stock-only', 'only items with stock on hand')
    .option('--limit <n>', 'page size (max 200)')
    .option('--cursor <token>', 'resume from a nextPage cursor')
    .option('--all', 'auto-paginate to the end')
    .option('--json', 'machine-readable output')
    .action(async (integrationId: string, opts: PagingOpts & { search?: string; inStockOnly?: boolean }) => {
      const config = await loadOrThrow(base.env)
      setExit(renderList(ctx, await fetchInventory<InventoryItem>(config, base.now, integrationId, opts), INVENTORY_COLUMNS))
    })

  // --- proposals (document drafts) ---
  const proposals = program
    .command('proposals')
    .description('Document drafts — issued only after you approve them in Financy')
  proposals
    .command('list')
    .option('--integration <id>', 'filter to one integration')
    .option('--status <status>', 'pending_approval|approved|executing|completed|partially_failed|failed|expired|cancelled')
    .option('--reference <ref>', 'filter by the clientReference you sent')
    .option('--limit <n>', 'how many (max 50; this list has no cursor)')
    .option('--json', 'machine-readable output')
    .action(async (opts: { integration?: string; status?: string; reference?: string; limit?: string }) => {
      const config = await loadOrThrow(base.env)
      setExit(renderList(ctx, await fetchProposals<Proposal>(config, base.now, opts), PROPOSAL_COLUMNS))
    })
  proposals
    .command('get <proposalId>')
    .option('--json', 'machine-readable output')
    .action(async (id: string) => {
      const config = await loadOrThrow(base.env)
      setExit(renderGet(ctx, await fetchProposal<Proposal>(config, base.now, id)))
    })
  proposals
    .command('create <integrationId>')
    .description('Create a document DRAFT from a JSON file; it is issued only after you approve it in Financy')
    .requiredOption('--file <path>', 'the draft request JSON: {"action": "...", "items": [...]}')
    .option('--idempotency-key <key>', 'reuse a key to make a retry return the first draft (default: a new UUID)')
    .option('--json', 'machine-readable output')
    .action(async (integrationId: string, opts: { file: string; idempotencyKey?: string }) => {
      const config = await loadOrThrow(base.env)
      const body = await readDraftFile(opts.file)
      const envelope = await createDraft<Proposal>(
        config,
        base.now,
        integrationId,
        body,
        opts.idempotencyKey ?? randomUUID(),
      )
      base.out(base.json ? JSON.stringify(envelope, null, 2) : renderDraft(envelope.data, envelope.replayed))
      setExit(EXIT.OK)
    })
}
