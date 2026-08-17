import type { Config } from './config.js'
import { USER_AGENT } from './version.js'
import { authFailed, CliError } from './errors.js'
import { httpFetch } from './http.js'
import {
  jwtExp,
  readCachedToken,
  writeCachedToken,
} from './token-store.js'

/** Seconds before `exp` at which a cached token is considered stale and re-minted. */
const EXPIRY_SKEW_SECONDS = 30

/**
 * Mint an access token from the Open-Finance token endpoint. The public gateway
 * takes the three credential values verbatim (`{userId, clientId, clientSecret}`)
 * and performs the Auth0 client-credentials exchange server-side, so no
 * `grant_type`/`audience` is sent from the client. Returns the raw JWT.
 */
export async function mintToken(config: Config): Promise<string> {
  const res = await httpFetch(config.authTokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify({
      userId: config.userId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    }),
  })

  if (!res.ok) {
    // Surface the upstream status + error body (an OAuth error description, not a
    // secret) so a live auth mismatch is diagnosable instead of a blank failure.
    const detail = (await res.text().catch(() => '')).slice(0, 400)
    throw authFailed(
      `token endpoint ${config.authTokenUrl} returned HTTP ${res.status}` +
        (detail ? `: ${detail}` : '') +
        ' — check credentials, or set FINANCY_AUTH_URL if the endpoint differs',
    )
  }

  const body = (await res.json().catch(() => ({}))) as { accessToken?: string }
  if (!body.accessToken) {
    // Report the field NAMES (never the values — the JWT could be among them) so
    // an unexpected success-body shape is diagnosable without leaking a token.
    const keys = body && typeof body === 'object' ? Object.keys(body) : []
    throw authFailed(
      `token endpoint returned 200 but no "accessToken" field; response keys: [${keys.join(', ')}]`,
    )
  }
  return body.accessToken
}

/** Mint a token and persist it to the cache (keyed by its JWT `exp`). */
async function mintAndCache(config: Config): Promise<string> {
  const accessToken = await mintToken(config)
  const exp = jwtExp(accessToken)
  if (exp !== null) {
    await writeCachedToken(config.configDir, { accessToken, exp })
  }
  return accessToken
}

/**
 * Return a usable access token: the cached one if present and not within
 * EXPIRY_SKEW_SECONDS of expiry, otherwise a freshly minted (and cached) one.
 */
export async function getAccessToken(config: Config, now: Date): Promise<string> {
  const cached = await readCachedToken(config.configDir)
  const nowSeconds = Math.floor(now.getTime() / 1000)
  if (cached && cached.exp - EXPIRY_SKEW_SECONDS > nowSeconds) {
    return cached.accessToken
  }
  return mintAndCache(config)
}

/**
 * Run an authorized request with a valid token (cached or freshly minted). If
 * the request fails auth (a 401, surfaced as an AUTH_FAILED CliError), the token
 * is re-minted once, bypassing the cache, and the request retried — covering a
 * revoked or server-side-expired token.
 */
export async function authorized<T>(
  config: Config,
  now: Date,
  request: (token: string) => Promise<T>,
): Promise<T> {
  if (config.bearerToken) return request(config.bearerToken)

  const token = await getAccessToken(config, now)
  try {
    return await request(token)
  } catch (error) {
    if (error instanceof CliError && error.code === 'AUTH_FAILED') {
      return await request(await mintAndCache(config))
    }
    throw error
  }
}
