import { loadConfig, notConfigured, type Config } from '../config.js'
import { CliError } from '../errors.js'
import { EXIT } from '../exit-codes.js'
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
import { fetchStatus } from '../core/status.js'
import { fetchRefresh } from '../core/refresh.js'

/** JSON-Schema fragment for a tool's arguments (kept plain so tests need no SDK/zod). */
export type JsonSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
}

export interface ToolContext {
  config: Config
  now: Date
}

export interface ToolDef {
  name: string
  description: string
  inputSchema: JsonSchema
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}

const str = (v: unknown): string | undefined => (v == null ? undefined : String(v))
const bool = (v: unknown): boolean => v === true

/** Require a string `id` argument (get_* tools). */
function requireId(args: Record<string, unknown>): string {
  const id = args.id
  if (typeof id !== 'string' || id.length === 0) {
    throw new CliError(EXIT.USAGE, 'MISSING_ARGUMENT', 'the `id` argument is required')
  }
  return id
}

// --- Reusable JSON-Schema fragments ---
const PAGING = {
  limit: { type: 'number', description: 'page size (defaults to the API default)' },
  cursor: { type: 'string', description: 'opaque nextPage cursor from a prior call' },
  all: { type: 'boolean', description: 'auto-paginate to the end (ignores cursor/limit paging)' },
}
const NO_ARGS: JsonSchema = { type: 'object', properties: {} }
const idSchema = (noun: string): JsonSchema => ({
  type: 'object',
  properties: { id: { type: 'string', description: `the ${noun} id` } },
  required: ['id'],
})

const listArgs = (a: Record<string, unknown>) => ({
  limit: str(a.limit),
  cursor: str(a.cursor),
  all: bool(a.all),
})

export const TOOLS: ToolDef[] = [
  {
    name: 'list_connections',
    description:
      'List the user\'s bank/card connections and their fetch state (status, data-through date, consent expiry, per-type counts). Start here to see what is connected. Supports limit/cursor paging and all.',
    inputSchema: { type: 'object', properties: { ...PAGING } },
    run: (a, ctx) => fetchConnections(ctx.config, ctx.now, listArgs(a)),
  },
  {
    name: 'get_connection',
    description: 'Read a single connection by id (from list_connections). Errors CONNECTION_NOT_FOUND if it is not in the user\'s scope.',
    inputSchema: idSchema('connection'),
    run: (a, ctx) => fetchConnection(ctx.config, ctx.now, requireId(a)),
  },
  {
    name: 'list_accounts',
    description:
      'List accounts with balances (securities embedded). Filter by type (CHECKING|CARD|LOAN|SAVINGS|SECURITY) or connection. Supports limit/cursor/all.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'CHECKING|CARD|LOAN|SAVINGS|SECURITY' },
        connection: { type: 'string', description: 'filter to one connection id' },
        ...PAGING,
      },
    },
    run: (a, ctx) =>
      fetchAccounts(ctx.config, ctx.now, {
        ...listArgs(a),
        type: str(a.type),
        connection: str(a.connection),
      }),
  },
  {
    name: 'get_account',
    description: 'Read a single account by id (from list_accounts). Errors ACCOUNT_NOT_FOUND if not in scope.',
    inputSchema: idSchema('account'),
    run: (a, ctx) => fetchAccount(ctx.config, ctx.now, requireId(a)),
  },
  {
    name: 'list_transactions',
    description:
      'List transactions, most useful with filters: from/to (YYYY-MM-DD), account, connection, type (BANK|CARD). Page with limit/cursor or fetch everything with all. Hebrew merchant names are returned as-is.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'earliest transaction date (YYYY-MM-DD)' },
        to: { type: 'string', description: 'latest transaction date (YYYY-MM-DD)' },
        account: { type: 'string', description: 'filter to one account id' },
        connection: { type: 'string', description: 'filter to one connection id' },
        type: { type: 'string', description: 'BANK|CARD' },
        ...PAGING,
      },
    },
    run: (a, ctx) =>
      fetchTransactions(ctx.config, ctx.now, {
        ...listArgs(a),
        from: str(a.from),
        to: str(a.to),
        account: str(a.account),
        connection: str(a.connection),
        type: str(a.type),
      }),
  },
  {
    name: 'get_transaction',
    description: 'Read a single transaction by id (from list_transactions). Errors TRANSACTION_NOT_FOUND if not in scope.',
    inputSchema: idSchema('transaction'),
    run: (a, ctx) => fetchTransaction(ctx.config, ctx.now, requireId(a)),
  },
  {
    name: 'list_categories',
    description: 'The static transaction-category taxonomy (English + Hebrew). Use to interpret transaction category fields. No arguments.',
    inputSchema: NO_ARGS,
    run: async (_a, ctx) => ({ data: await fetchCategories(ctx.config, ctx.now) }),
  },
  {
    name: 'list_providers',
    description: 'Reference data: the list of banks/providers, to resolve providerId values. No arguments.',
    inputSchema: NO_ARGS,
    run: (_a, ctx) => fetchProviders(ctx.config, ctx.now),
  },
  {
    name: 'list_bank_branches',
    description: 'Reference data: bank branches. No arguments (this route takes no paging).',
    inputSchema: NO_ARGS,
    run: (_a, ctx) => fetchBranches(ctx.config, ctx.now),
  },
  {
    name: 'get_status',
    description:
      'Per-connection freshness rollup: for each connection its status, data-through date, consent expiry, and account count, plus staleThresholdDays. Call this first to decide whether data is fresh enough before answering questions about balances or transactions.',
    inputSchema: NO_ARGS,
    run: async (_a, ctx) => {
      const { data, staleThresholdDays } = await fetchStatus(ctx.config, ctx.now)
      return { data, staleThresholdDays }
    },
  },
  {
    name: 'refresh_connections',
    description:
      'Trigger an on-demand refresh of ALL connections (org-wide). This COSTS 20 credits — always confirm with the user before calling it. Data lands after a few minutes; poll get_status to watch progress. Returns the refresh outcome (accepted / already_running).',
    inputSchema: NO_ARGS,
    run: (_a, ctx) => fetchRefresh(ctx.config, ctx.now),
  },
]

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

/** Render a caught error as the CLI's `{error:{code,message,...}}` envelope. */
function errorEnvelope(error: unknown): { error: Record<string, unknown> } {
  const e =
    error instanceof CliError
      ? error
      : new CliError(EXIT.UNEXPECTED, 'UNEXPECTED', String((error as Error)?.message ?? error))
  return { error: { code: e.code, message: e.message, ...e.extra } }
}

export interface CallToolIO {
  env: NodeJS.ProcessEnv
  now?: Date
  config?: Config
}

/**
 * Dispatch a tool by name: resolve config (unconfigured → the structured
 * NOT_CONFIGURED error, on every tool), run it, and return its envelope. Errors
 * are returned as the `{error:{code,message}}` envelope rather than thrown, so
 * the server surfaces them to the agent as machine-readable tool output.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  io: CallToolIO,
): Promise<unknown> {
  try {
    const tool = BY_NAME.get(name)
    if (!tool) {
      throw new CliError(EXIT.USAGE, 'UNKNOWN_TOOL', `no tool named '${name}'`)
    }
    let config = io.config

    if (!config) {
      const result = await loadConfig(io.env)
      if (!result.ok) throw notConfigured(result)
      config = result.config
    }
    return await tool.run(args ?? {}, { config, now: io.now ?? new Date() })
  } catch (error) {
    return errorEnvelope(error)
  }
}
