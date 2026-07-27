import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface CachedToken {
  accessToken: string
  /** JWT `exp`, seconds since the epoch. */
  exp: number
}

/** Decode a JWT's `exp` claim (seconds since epoch) without verifying the signature. */
export function jwtExp(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: number
    }
    return typeof decoded.exp === 'number' ? decoded.exp : null
  } catch {
    return null
  }
}

function tokenFile(configDir: string): string {
  return join(configDir, 'token.json')
}

/** Read the cached token, or null if absent/unreadable/malformed. */
export async function readCachedToken(configDir: string): Promise<CachedToken | null> {
  try {
    const raw = await readFile(tokenFile(configDir), 'utf8')
    const parsed = JSON.parse(raw) as Partial<CachedToken>
    if (typeof parsed.accessToken === 'string' && typeof parsed.exp === 'number') {
      return { accessToken: parsed.accessToken, exp: parsed.exp }
    }
    return null
  } catch {
    return null
  }
}

/** Persist the token to `<configDir>/token.json` with owner-only (0600) permissions. */
export async function writeCachedToken(
  configDir: string,
  token: CachedToken,
): Promise<void> {
  await mkdir(configDir, { recursive: true, mode: 0o700 })
  await writeFile(tokenFile(configDir), JSON.stringify(token), { mode: 0o600 })
}
