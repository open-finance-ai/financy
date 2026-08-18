import type { Command } from 'commander'
import { loadConfig, notConfigured, type Config } from '../config.js'
import { EXIT } from '../exit-codes.js'
import type { Column } from '../render.js'
import type { Connection } from '../api.js'
import {
  fetchConnections,
  fetchConnection,
  fetchAccounts,
  fetchAccount,
  fetchTransactions,
  fetchTransaction,
  fetchCategories,
  fetchProviders,
  fetchBranches,
} from '../core/read.js'
import { renderList, renderGet, type RenderContext } from './resources.js'

export interface ReadBase {
  env: NodeJS.ProcessEnv
  now: Date
  json: boolean
  out: (chunk: string) => void
}

async function loadOrThrow(env: NodeJS.ProcessEnv): Promise<Config> {
  const result = await loadConfig(env)
  if (!result.ok) throw notConfigured(result)
  return result.config
}

const ils = (n: unknown) => {
  const num = typeof n === 'number' ? n : Number(n)
  return typeof n !== 'number' && typeof n !== 'string'
    ? '—'
    : !Number.isFinite(num)
      ? '—'
      : (num < 0 ? '-' : '') + '₪' + Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2 })
}

/** Display a scalar; objects/arrays and nullish become an em dash (never `[object Object]`). */
const dash = (v: unknown) =>
  v == null || typeof v === 'object' ? '—' : String(v)

// --- Row shapes (subset of the live mapper outputs, reconciled 2026-07-24). All
// fields optional and money is nested + often a string, so accessors must never
// assume a nested object is present. ---

interface Money {
  amount?: number | string
  currency?: string
}

interface Balance {
  balanceType?: string
  balanceAmount?: Money
}

interface Account {
  id: string
  accountType?: string
  product?: string
  accountNumber?: string
  providerId?: string
  balances?: Balance[]
}

interface Transaction {
  id: string
  /** The composite sort key — what `transactions get` is keyed by, unlike `id`. */
  SK?: string
  type?: string
  merchantName?: string
  description?: { description?: string; fixedText?: string }
  amount?: { chargedAmount?: Money; originalAmount?: Money }
  category?: { main?: string; sub?: string }
  date?: { transactionDate?: string }
}

interface Provider {
  id?: string
  providerFriendlyId?: string
  name?: string
  nameNativeLanguage?: string
  mode?: string
}

// Branch shape is unverified against live data (the endpoint returned an empty
// array for the test org); columns are best-effort and null-safe. --json emits
// the raw objects verbatim, so no field is ever lost.
interface Branch {
  id?: string
  bankCode?: string
  branchCode?: string
  branchName?: string
  name?: string
  city?: string
}

/** The headline balance for an account: the closing-booked one, else the first. */
function accountBalance(a: Account): number | string | undefined {
  const b = a.balances?.find((x) => x.balanceType === 'closingBooked') ?? a.balances?.[0]
  return b?.balanceAmount?.amount
}

/** The charged amount (what actually hit the account); falls back to the original. */
function txnAmount(t: Transaction): number | string | undefined {
  const charged = t.amount?.chargedAmount?.amount
  const chargedNum = Number(charged)
  if (charged !== '' && charged != null && Number.isFinite(chargedNum)) return charged
  return t.amount?.originalAmount?.amount
}

const CONNECTION_COLUMNS: Column<Connection>[] = [
  { header: 'ID', value: (c) => c.id },
  { header: 'PROVIDER', value: (c) => dash(c.providerId) },
  { header: 'STATUS', value: (c) => c.status },
  { header: 'DATA THROUGH', value: (c) => dash(c.lastFetchedDataDate) },
  { header: 'EXPIRES', value: (c) => dash(c.expiryDate) },
  { header: 'TXNS', value: (c) => dash(c.transactions) },
]

const ACCOUNT_COLUMNS: Column<Account>[] = [
  { header: 'ID', value: (a) => a.id },
  { header: 'TYPE', value: (a) => dash(a.accountType) },
  { header: 'NAME', value: (a) => dash(a.product ?? a.accountNumber) },
  { header: 'PROVIDER', value: (a) => dash(a.providerId) },
  { header: 'BALANCE', value: (a) => ils(accountBalance(a)) },
]

const TRANSACTION_COLUMNS: Column<Transaction>[] = [
  { header: 'DATE', value: (t) => dash(t.date?.transactionDate) },
  { header: 'AMOUNT', value: (t) => ils(txnAmount(t)) },
  { header: 'DESCRIPTION', value: (t) => dash(t.merchantName ?? t.description?.description) },
  { header: 'CATEGORY', value: (t) => `${dash(t.category?.main)}/${dash(t.category?.sub)}` },
  { header: 'TYPE', value: (t) => dash(t.type) },
  // The SK, not the id: this column exists to be pasted into `transactions get`,
  // and that route is keyed by SK. Matches accounts/connections, whose ID column
  // likewise prints the value their `get` accepts.
  { header: 'SK', value: (t) => t.SK ?? t.id },
]

const PROVIDER_COLUMNS: Column<Provider>[] = [
  { header: 'ID', value: (p) => dash(p.providerFriendlyId ?? p.id) },
  { header: 'NAME', value: (p) => dash(p.name) },
  { header: 'NATIVE', value: (p) => dash(p.nameNativeLanguage) },
  { header: 'MODE', value: (p) => dash(p.mode) },
]

const BRANCH_COLUMNS: Column<Branch>[] = [
  { header: 'BANK', value: (b) => dash(b.bankCode) },
  { header: 'BRANCH', value: (b) => dash(b.branchCode ?? b.id) },
  { header: 'NAME', value: (b) => dash(b.branchName ?? b.name) },
  { header: 'CITY', value: (b) => dash(b.city) },
]

interface ListOpts {
  limit?: string
  cursor?: string
  all?: boolean
  type?: string
  connection?: string
  account?: string
  from?: string
  to?: string
}

/** Register the read command tree (connections/accounts/transactions/categories/providers). */
export function registerReadCommands(
  program: Command,
  base: ReadBase,
  setExit: (code: number) => void,
): void {
  const ctx: RenderContext = { json: base.json, out: base.out }

  // --- connections ---
  const connections = program
    .command('connections')
    .description('Bank/card connections and their fetch state')
  connections
    .command('list')
    .option('--limit <n>', 'page size')
    .option('--cursor <token>', 'resume from a nextPage cursor')
    .option('--all', 'auto-paginate to the end')
    .option('--json', 'machine-readable output')
    .action(async (opts: ListOpts) => {
      const config = await loadOrThrow(base.env)
      const envelope = await fetchConnections<Connection>(config, base.now, opts)
      setExit(renderList(ctx, envelope, CONNECTION_COLUMNS))
    })
  connections
    .command('get <id>')
    .option('--json', 'machine-readable output')
    .action(async (id: string) => {
      const config = await loadOrThrow(base.env)
      setExit(renderGet(ctx, await fetchConnection<Connection>(config, base.now, id)))
    })

  // --- accounts ---
  const accounts = program.command('accounts').description('Accounts with balances')
  accounts
    .command('list')
    .option('--type <type>', 'CHECKING|CARD|LOAN|SAVINGS|SECURITY')
    .option('--connection <id>', 'filter by connection')
    .option('--limit <n>', 'page size')
    .option('--cursor <token>', 'resume from a nextPage cursor')
    .option('--all', 'auto-paginate to the end')
    .option('--json', 'machine-readable output')
    .action(async (opts: ListOpts) => {
      const config = await loadOrThrow(base.env)
      const envelope = await fetchAccounts<Account>(config, base.now, opts)
      setExit(renderList(ctx, envelope, ACCOUNT_COLUMNS))
    })
  accounts
    .command('get <id>')
    .option('--json', 'machine-readable output')
    .action(async (id: string) => {
      const config = await loadOrThrow(base.env)
      setExit(renderGet(ctx, await fetchAccount<Account>(config, base.now, id)))
    })

  // --- transactions ---
  const transactions = program.command('transactions').description('Transactions with filters')
  transactions
    .command('list')
    .option('--from <date>', 'earliest transaction date (YYYY-MM-DD)')
    .option('--to <date>', 'latest transaction date (YYYY-MM-DD)')
    .option('--account <id>', 'filter by account')
    .option('--connection <id>', 'filter by connection')
    .option('--type <type>', 'BANK|CARD')
    .option('--limit <n>', 'page size')
    .option('--cursor <token>', 'resume from a nextPage cursor')
    .option('--all', 'auto-paginate to the end')
    .option('--json', 'machine-readable output')
    .action(async (opts: ListOpts) => {
      const config = await loadOrThrow(base.env)
      const envelope = await fetchTransactions<Transaction>(config, base.now, opts)
      setExit(renderList(ctx, envelope, TRANSACTION_COLUMNS))
    })
  transactions
    .command('get <sk>')
    .description('Read one transaction by its SK (the SK column of `transactions list`)')
    .option('--json', 'machine-readable output')
    .action(async (sk: string) => {
      const config = await loadOrThrow(base.env)
      setExit(renderGet(ctx, await fetchTransaction<Transaction>(config, base.now, sk)))
    })

  // --- categories (static taxonomy; emitted as-is) ---
  program
    .command('categories')
    .description('The category taxonomy (English + Hebrew)')
    .option('--json', 'machine-readable output')
    .action(async () => {
      const config = await loadOrThrow(base.env)
      const data = await fetchCategories(config, base.now)
      base.out(
        base.json ? JSON.stringify({ data }, null, 2) : JSON.stringify(data, null, 2) + '\n',
      )
      setExit(EXIT.OK)
    })

  // --- providers ---
  const providers = program.command('providers').description('Reference data: banks and branches')
  providers
    .command('list')
    .option('--json', 'machine-readable output')
    .action(async () => {
      const config = await loadOrThrow(base.env)
      setExit(renderList(ctx, await fetchProviders<Provider>(config, base.now), PROVIDER_COLUMNS))
    })
  providers
    .command('branches')
    .description('Bank branch reference data (no paging)')
    .option('--json', 'machine-readable output')
    .action(async () => {
      const config = await loadOrThrow(base.env)
      setExit(renderList(ctx, await fetchBranches<Branch>(config, base.now), BRANCH_COLUMNS))
    })
}
