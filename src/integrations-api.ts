import type { Config } from './config.js'
import { USER_AGENT } from './version.js'
import { httpFetch } from './http.js'
import { authFailed, apiUnavailable, integrationsError, type IntegrationsApiError } from './errors.js'
import { debugBody, type Query } from './api.js'

export interface IntegrationsResponse<T> {
  body: T
  replayed: boolean
}

function isApiError(value: unknown): value is IntegrationsApiError {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as IntegrationsApiError).type === 'string' &&
    typeof (value as IntegrationsApiError).message === 'string'
  )
}

/** Route paths never repeat the base path. The list route is the base itself, matched only with its trailing slash. */
function integrationsUrl(config: Config, path: string, query: Query): string {
  const url = new URL(config.integrationsBaseUrl.replace(/\/+$/, '') + path)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value)
  }
  return url.toString()
}

async function send<T>(
  config: Config,
  token: string,
  method: 'GET' | 'POST',
  path: string,
  options: { query?: Query; body?: unknown; headers?: Record<string, string> } = {},
): Promise<IntegrationsResponse<T>> {
  const res = await httpFetch(integrationsUrl(config, path, options.query ?? {}), {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'user-agent': USER_AGENT,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: config.abortSignal,
  })
  const parsed = (await res.json().catch(() => undefined)) as unknown
  if (res.ok) {
    debugBody(path, parsed)
    return { body: (parsed ?? {}) as T, replayed: res.headers.get('idempotent-replayed') === 'true' }
  }
  if (isApiError(parsed)) throw integrationsError(parsed, res.status)
  if (res.status === 401) throw authFailed()
  throw apiUnavailable(`the integrations API returned HTTP ${res.status}`)
}

/** GET an integrations route; the body is returned as the API sent it. */
export async function integrationsGet<T = unknown>(
  config: Config,
  token: string,
  path: string,
  query: Query = {},
): Promise<T> {
  return (await send<T>(config, token, 'GET', path, { query })).body
}

/** POST an integrations route, with optional extra headers (e.g. Idempotency-Key). */
export async function integrationsPost<T = unknown>(
  config: Config,
  token: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<IntegrationsResponse<T>> {
  return send<T>(config, token, 'POST', path, { body, headers })
}
