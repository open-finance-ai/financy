import type { Config } from '../config.js'
import { authorized } from '../auth.js'
import { getPage, getById, type Query } from '../api.js'
import { CliError } from '../errors.js'
import { EXIT } from '../exit-codes.js'

/** The list envelope shared by the CLI (`--json`) and MCP tools. */
export interface ListEnvelope<T> {
  data: T[]
  count: number
  nextPage: string | null
}

/** The single-resource envelope. */
export interface GetEnvelope<T> {
  data: T
}

export interface ListArgs {
  limit?: string
  cursor?: string
  all?: boolean
}

const upper = (v: string | undefined) => (v === undefined ? undefined : v.toUpperCase())

async function fetchPage<T>(config: Config, now: Date, path: string, query: Query) {
  return authorized(config, now, (token) => getPage<T>(config, token, path, query))
}

/** Follow `nextPage` cursors to exhaustion, accumulating all items. */
async function collectAll<T>(
  config: Config,
  now: Date,
  path: string,
  query: Query,
): Promise<ListEnvelope<T>> {
  const data: T[] = []
  let cursor = query.nextPage
  do {
    const page = await fetchPage<T>(config, now, path, { ...query, nextPage: cursor })
    data.push(...page.items)
    cursor = page.nextPage ?? undefined
  } while (cursor)
  return { data, nextPage: null, count: data.length }
}

/** Fetch a list resource as an envelope (single page, or all pages when `all`). */
export async function list<T>(
  config: Config,
  now: Date,
  path: string,
  query: Query,
  all: boolean,
): Promise<ListEnvelope<T>> {
  if (all) return collectAll<T>(config, now, path, query)
  const page = await fetchPage<T>(config, now, path, query)
  return { data: page.items, count: page.count, nextPage: page.nextPage }
}

/** Fetch a single resource by path; throws the given NOT_FOUND error when absent. */
export async function getOne<T>(
  config: Config,
  now: Date,
  path: string,
  notFound: CliError,
): Promise<GetEnvelope<T>> {
  const resource = await authorized(config, now, (token) =>
    getById<T>(config, token, path),
  )
  if (resource === null) throw notFound
  return { data: resource }
}

const notFound = (code: string, message: string) =>
  new CliError(EXIT.NOT_FOUND, code, message)

// --- Per-resource fetchers: the single source of truth for paths + query mapping,
// shared by the CLI command layer (src/commands/read-commands.ts) and MCP tools. ---

export function fetchConnections<T>(config: Config, now: Date, args: ListArgs) {
  return list<T>(config, now, '/connections', { limit: args.limit, nextPage: args.cursor }, !!args.all)
}

export function fetchConnection<T>(config: Config, now: Date, id: string) {
  return getOne<T>(
    config,
    now,
    `/connections/${encodeURIComponent(id)}`,
    notFound('CONNECTION_NOT_FOUND', `no connection ${id} in your scope`),
  )
}

export interface AccountListArgs extends ListArgs {
  type?: string
  connection?: string
}

export function fetchAccounts<T>(config: Config, now: Date, args: AccountListArgs) {
  return list<T>(
    config,
    now,
    '/data/accounts',
    {
      accountType: upper(args.type),
      connectionId: args.connection,
      limit: args.limit,
      nextPage: args.cursor,
    },
    !!args.all,
  )
}

export function fetchAccount<T>(config: Config, now: Date, id: string) {
  return getOne<T>(
    config,
    now,
    `/data/accounts/${encodeURIComponent(id)}`,
    notFound('ACCOUNT_NOT_FOUND', `no account ${id} in your scope`),
  )
}

export interface TransactionListArgs extends ListArgs {
  type?: string
  account?: string
  connection?: string
  from?: string
  to?: string
}

export function fetchTransactions<T>(config: Config, now: Date, args: TransactionListArgs) {
  return list<T>(
    config,
    now,
    '/data/transactions',
    {
      dateFrom: args.from,
      dateTo: args.to,
      accountId: args.account,
      connectionId: args.connection,
      type: upper(args.type),
      limit: args.limit,
      nextPage: args.cursor,
    },
    !!args.all,
  )
}

export function fetchTransaction<T>(config: Config, now: Date, id: string) {
  return getOne<T>(
    config,
    now,
    `/data/transactions/${encodeURIComponent(id)}`,
    notFound('TRANSACTION_NOT_FOUND', `no transaction ${id} in your scope`),
  )
}

/** The static category taxonomy, returned verbatim (no list envelope). */
export function fetchCategories(config: Config, now: Date): Promise<unknown> {
  return authorized(config, now, (token) =>
    getById(config, token, '/data/transaction-categories'),
  )
}

export function fetchProviders<T>(config: Config, now: Date) {
  return list<T>(config, now, '/providers', {}, false)
}

// /bank-branches takes no query params (it rejects `limit`) and returns a bare
// array, so there is no paging here.
export function fetchBranches<T>(config: Config, now: Date) {
  return list<T>(config, now, '/bank-branches', {}, false)
}
