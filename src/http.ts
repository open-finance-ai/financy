import { apiUnavailable } from './errors.js'

/**
 * `fetch` with transport-level failures (DNS, refused, reset, timeout) mapped to
 * the API_UNAVAILABLE CliError (exit 7). HTTP status handling is left to callers.
 */
export async function httpFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw apiUnavailable()
  }
}
