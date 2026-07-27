import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

export interface Credentials {
  clientId: string
  clientSecret: string
  userId: string
}

export interface Endpoints {
  authTokenUrl: string
  apiBaseUrl: string
  chatBaseUrl: string
  configDir: string
}

export type Config = Credentials & Endpoints

const DEFAULT_AUTH_TOKEN_URL = 'https://api.open-finance.ai/oauth/token'
const DEFAULT_API_BASE_URL = 'https://api.open-finance.ai/v2'
// service-chat's initiated-refresh route lives outside the /v2 base path, under
// the doubled /chat/chat prefix (gateway stage + service base path).
const DEFAULT_CHAT_BASE_URL = 'https://api.open-finance.ai/chat/chat'

function resolveConfigDir(env: NodeJS.ProcessEnv): string {
  if (env.FINANCY_CONFIG_DIR) return env.FINANCY_CONFIG_DIR
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'financy')
}

/** Endpoint/config-dir settings, from env overrides or production defaults. Always resolvable. */
export function resolveEndpoints(env: NodeJS.ProcessEnv): Endpoints {
  return {
    authTokenUrl: env.FINANCY_AUTH_URL ?? DEFAULT_AUTH_TOKEN_URL,
    apiBaseUrl: env.FINANCY_API_URL ?? DEFAULT_API_BASE_URL,
    chatBaseUrl: env.FINANCY_CHAT_URL ?? DEFAULT_CHAT_BASE_URL,
    configDir: resolveConfigDir(env),
  }
}

function configFile(configDir: string): string {
  return join(configDir, 'config.json')
}

interface ConfigFile {
  profiles?: { default?: Partial<Credentials> }
}

/** Read the `default` profile's credentials from the config file, or null if absent/unreadable. */
export async function readCredentialsFile(
  configDir: string,
): Promise<Partial<Credentials> | null> {
  try {
    const raw = await readFile(configFile(configDir), 'utf8')
    const parsed = JSON.parse(raw) as ConfigFile
    return parsed.profiles?.default ?? null
  } catch {
    return null
  }
}

/** Persist credentials as `{profiles:{default}}` with owner-only (0600) permissions. */
export async function writeCredentialsFile(
  configDir: string,
  credentials: Credentials,
): Promise<void> {
  await mkdir(configDir, { recursive: true, mode: 0o700 })
  await writeFile(
    configFile(configDir),
    JSON.stringify({ profiles: { default: credentials } }, null, 2),
    { mode: 0o600 },
  )
}

export type ConfigResult =
  | { ok: true; config: Config }
  | { ok: false; missing: string[] }

/**
 * Resolve the full config: endpoints from env, credentials merged from the
 * config file overlaid by `FINANCY_*` env vars (env always wins per field).
 */
export async function loadConfig(env: NodeJS.ProcessEnv): Promise<ConfigResult> {
  const endpoints = resolveEndpoints(env)
  const file = (await readCredentialsFile(endpoints.configDir)) ?? {}

  const clientId = env.FINANCY_CLIENT_ID ?? file.clientId
  const clientSecret = env.FINANCY_CLIENT_SECRET ?? file.clientSecret
  const userId = env.FINANCY_USER_ID ?? file.userId

  const missing: string[] = []
  if (!clientId) missing.push('FINANCY_CLIENT_ID')
  if (!clientSecret) missing.push('FINANCY_CLIENT_SECRET')
  if (!userId) missing.push('FINANCY_USER_ID')
  if (!clientId || !clientSecret || !userId) return { ok: false, missing }

  return {
    ok: true,
    config: { clientId, clientSecret, userId, ...endpoints },
  }
}
