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
    'the API is available on Starter and Pro plans — upgrade in Financy → Settings → Plan',
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
