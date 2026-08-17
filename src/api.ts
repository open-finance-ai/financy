import type { Config } from './config.js'
import { USER_AGENT } from './version.js'
import { httpFetch } from './http.js'
import {
  authFailed,
  planNotEligible,
  forbidden,
  apiUnavailable,
  insufficientCredits,
  noRefreshableConnections,
} from './errors.js'

// Shape reconciled against the live /connections response (2026-07-24). Most
// fields are optional: inactive/expired/pending connections omit provider,
// counts, and any data-freshness dates entirely.
export interface Connection {
  id: string
  providerId?: string
  status: string
  accounts?: number
  cards?: number
  savings?: number
  loans?: number
  securities?: number
  transactions?: number
  startDate?: string
  expiryDate?: string
  /** Present only once a connection has actually fetched data. */
  lastFetchedDataDate?: string
  lastFetchedAt?: string
  updatedAt?: string
  error?: unknown
}

export interface Page<T> {
  items: T[]
  nextPage: string | null
  count: number
}

export type Query = Record<string, string | undefined>

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'user-agent': USER_AGENT }
}

/** Map a non-OK HTTP status to the CLI's error contract, including the server's detail. */
async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return
  if (res.status === 401) throw authFailed()
  const detail = (await res.text().catch(() => '')).slice(0, 300)
  if (res.status === 403) {
    // The plan gate returns NOT_AVAILABLE_ON_PLAN; any other 403 is a scope /
    // permission denial we surface distinctly rather than nagging about upgrades.
    if (!detail || /NOT_AVAILABLE_ON_PLAN|plan/i.test(detail)) throw planNotEligible()
    throw forbidden(detail)
  }
  throw apiUnavailable(
    `the API returned HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
  )
}

/** When FINANCY_DEBUG is set, print the raw response body to stderr for shape reconciliation. */
function debugBody(path: string, body: unknown): void {
  if (process.env.FINANCY_DEBUG) {
    process.stderr.write(`[financy:debug] ${path} →\n${JSON.stringify(body, null, 2)}\n`)
  }
}

/** GET a paginated list resource. `query` values that are undefined are omitted. */
export async function getPage<T = unknown>(
  config: Config,
  token: string,
  path: string,
  query: Query = {},
): Promise<Page<T>> {
  const url = new URL(config.apiBaseUrl + path)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value)
  }
  const res = await httpFetch(url.toString(), {
    headers: authHeaders(token),
    signal: config.abortSignal,
  })
  await ensureOk(res)
  const raw = (await res.json().catch(() => ({}))) as unknown
  debugBody(path, raw)
  return normalizePage<T>(raw)
}

/**
 * Coerce a list response into a `Page`. Endpoints vary: some return
 * `{items, nextPage, count}`, some a bare array (e.g. /providers), some `{}`.
 * Normalizing here means no list command can crash on a missing `items`.
 */
function normalizePage<T>(raw: unknown): Page<T> {
  if (Array.isArray(raw)) return { items: raw as T[], nextPage: null, count: raw.length }
  const obj = (raw ?? {}) as { items?: T[]; nextPage?: string | null; count?: number }
  const items = Array.isArray(obj.items) ? obj.items : []
  return { items, nextPage: obj.nextPage ?? null, count: obj.count ?? items.length }
}

/**
 * GET a single resource by path. Returns null when the API signals not-found —
 * either a 404 or a 200 with an empty-object body (the accounts/transactions
 * convention). Callers surface null as the NOT_FOUND exit code.
 */
export async function getById<T = unknown>(
  config: Config,
  token: string,
  path: string,
): Promise<T | null> {
  const res = await httpFetch(config.apiBaseUrl + path, {
    headers: authHeaders(token),
    signal: config.abortSignal,
  })
  if (res.status === 404) return null
  await ensureOk(res)
  const body = (await res.json()) as T
  debugBody(path, body)
  if (body && typeof body === 'object' && Object.keys(body).length === 0) return null
  return body
}

/** The service-chat refresh outcome (the 200 result object we envelope as-is).
 * The live `accepted` body is just `{status}`; connections/cost may be absent. */
export interface RefreshResult {
  status: string
  connections?: number
  cost?: number
}

/**
 * POST service-chat's org-wide initiated refresh. On success returns the result
 * object verbatim. A 401 is surfaced as AUTH_FAILED so `authorized()` re-mints
 * and retries; other non-OK statuses are mapped by the caller.
 */
export async function postRefresh(
  config: Config,
  token: string,
): Promise<RefreshResult> {
  const res = await httpFetch(config.chatBaseUrl + '/connections/refresh', {
    method: 'POST',
    headers: authHeaders(token),
    signal: config.abortSignal,
  })
  if (res.status === 401) throw authFailed()
  if (res.status === 402) {
    const body = (await res.json().catch(() => ({}))) as { cost?: number; balance?: number }
    throw insufficientCredits(body.cost ?? 20, body.balance ?? 0)
  }
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw noRefreshableConnections(body.message)
  }
  await ensureOk(res)
  return (await res.json()) as RefreshResult
}

/** GET /v2/connections — the user's bank/card connections and their fetch state. */
export async function getConnections(
  config: Config,
  token: string,
): Promise<Page<Connection>> {
  return getPage<Connection>(config, token, '/connections')
}
