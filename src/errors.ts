import { EXIT } from './exit-codes.js'

/**
 * An error with a stable machine-readable `code` and the process `exitCode` to
 * surface it with. Commands throw these; `run()` renders them (JSON on stderr
 * under `--json`, otherwise a one-line message) and returns the exit code.
 */
export class CliError extends Error {
  readonly code: string
  readonly exitCode: number
  readonly extra: Record<string, unknown>

  constructor(
    exitCode: number,
    code: string,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'CliError'
    this.code = code
    this.exitCode = exitCode
    this.extra = extra
  }
}

export const authFailed = (message = 'authentication failed — check your credentials or run financy setup') =>
  new CliError(EXIT.AUTH, 'AUTH_FAILED', message)

export const planNotEligible = () =>
  new CliError(
    EXIT.PLAN,
    'NOT_AVAILABLE_ON_PLAN',
    'the API is available on every paid plan, including Starter, Pro, and Ultra — upgrade in Financy → Settings → Plan',
  )

/** A 403 that is NOT the plan gate — a missing scope or otherwise forbidden route. */
export const forbidden = (detail: string) =>
  new CliError(EXIT.PLAN, 'FORBIDDEN', `the API denied this request (403): ${detail}`)

export const insufficientCredits = (cost: number, balance: number) =>
  new CliError(
    EXIT.CREDITS,
    'INSUFFICIENT_CREDITS',
    `an initiated refresh costs ${cost} credits; you have ${balance}`,
    { cost, balance },
  )

export const noRefreshableConnections = (
  message = 'no connections are eligible for refresh',
) => new CliError(EXIT.UNEXPECTED, 'NO_REFRESHABLE_CONNECTIONS', message)

export const apiUnavailable = (
  message = 'the Open-Finance API is unavailable — check your connection and try again',
) => new CliError(EXIT.API, 'API_UNAVAILABLE', message)

/** The error body every integrations API failure carries (all but a gateway's bare 401). */
export interface IntegrationsApiError {
  type: string
  message: string
  retryable?: boolean
  userActionRequired?: boolean
  action?: { kind: string; url?: string; plan?: string; retryAfter?: string; integrationId?: string }
  requestId?: string
}

const PLAN_TYPES = new Set([
  'UPGRADE_REQUIRED',
  'INTEGRATION_LIMIT_REACHED',
  'NOT_ENTITLED',
  'ENTITLEMENT_NOT_PROVISIONED',
])

function integrationsExitCode(type: string, status: number): number {
  if (type === 'SIGN_IN_AGAIN') return EXIT.AUTH
  if (PLAN_TYPES.has(type) || status === 403) return EXIT.PLAN
  if (status === 404) return EXIT.NOT_FOUND
  if (status === 400 || status === 422) return EXIT.USAGE
  if (status === 429 || status >= 500) return EXIT.API
  return EXIT.UNEXPECTED
}

/**
 * Map an integrations API error onto the CLI's contract. The API's `type` is
 * kept as the error code (it is already stable and specific); the exit code
 * comes from its class: 403 plan/permission → 4, 404 → 6, 400/422 → 2,
 * 409/410 → 1, 429/5xx → 7.
 */
export function integrationsError(body: IntegrationsApiError, status: number): CliError {
  const hint =
    body.action?.url
      ? ` — ${body.action.url}`
      : body.type === 'UPGRADE_REQUIRED'
        ? ' — upgrade in Financy → Settings → Plan'
        : ''
  return new CliError(integrationsExitCode(body.type, status), body.type, `${body.message}${hint}`, {
    retryable: body.retryable === true,
    userActionRequired: body.userActionRequired === true,
    ...(body.action ? { action: body.action } : {}),
    ...(body.requestId ? { requestId: body.requestId } : {}),
  })
}
