import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { sanitizeCredential } from './credentials.js'
import { CliError } from './errors.js'
import { EXIT } from './exit-codes.js'

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

export type Config = Credentials &
  Endpoints & {
    bearerToken?: string
    abortSignal?: AbortSignal
  }

const DEFAULT_AUTH_TOKEN_URL = 'https://api.open-finance.ai/oauth/token'
const DEFAULT_API_BASE_URL = 'https://api.open-finance.ai/v2'
// The initiated-refresh route lives outside the /v2 base path, under the
// doubled /chat/chat prefix (gateway stage + service base path).
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

export type CredentialsFileResult =
  | { status: 'ok'; credentials: Partial<Credentials> }
  | { status: 'missing' }
  | { status: 'unreadable'; detail: string }
  | { status: 'malformed'; detail: string }

/**
 * Decode config bytes, tolerating the encodings Windows tools produce: PowerShell
 * 5.1's `>` and `Out-File` write UTF-16LE with a BOM, and `Set-Content` writes
 * UTF-8 with a BOM — both make a plain utf8 `JSON.parse` fail.
 */
function decodeConfigBytes(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le')
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return Buffer.from(bytes.subarray(2)).swap16().toString('utf16le')
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3).toString('utf8')
  }
  return bytes.toString('utf8')
}

/**
 * Read the `default` profile's credentials from the config file.
 *
 * Each failure is reported distinctly: a hand-edited file that cannot be parsed
 * used to be indistinguishable from having no credentials at all, which sent
 * users hunting for a credential problem that was really an encoding or shape
 * problem in a file they had just written.
 */
export async function readCredentialsFile(configDir: string): Promise<CredentialsFileResult> {
  let bytes: Buffer
  try {
    bytes = await readFile(configFile(configDir))
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return { status: 'missing' }
    return { status: 'unreadable', detail: code ?? String(error) }
  }

  let parsed: ConfigFile
  try {
    parsed = JSON.parse(decodeConfigBytes(bytes)) as ConfigFile
  } catch (error) {
    return { status: 'malformed', detail: `not valid JSON (${(error as Error).message})` }
  }

  const credentials = parsed?.profiles?.default
  if (!credentials || typeof credentials !== 'object') {
    return {
      status: 'malformed',
      detail: 'no "profiles.default" object — expected {"profiles":{"default":{…}}}',
    }
  }
  return { status: 'ok', credentials }
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

export function bearerConfig(
  env: NodeJS.ProcessEnv,
  bearerToken: string,
  abortSignal?: AbortSignal,
): Config {
  return {
    ...resolveEndpoints(env),
    clientId: '',
    clientSecret: '',
    userId: '',
    bearerToken,
    abortSignal,
  }
}

export type ConfigResult =
  | { ok: true; config: Config }
  | { ok: false; missing: string[]; fileProblem?: string }

/** A credential value from env or file, normalized; undefined when absent or empty. */
function pick(envValue: string | undefined, fileValue: string | undefined): string | undefined {
  const raw = envValue ?? fileValue
  if (raw === undefined) return undefined
  const value = sanitizeCredential(raw)
  return value === '' ? undefined : value
}

/**
 * Resolve the full config: endpoints from env, credentials merged from the
 * config file overlaid by `FINANCY_*` env vars (env always wins per field).
 * When the config file exists but could not be used, that is reported alongside
 * the missing values rather than swallowed.
 */
export async function loadConfig(env: NodeJS.ProcessEnv): Promise<ConfigResult> {
  const endpoints = resolveEndpoints(env)
  const result = await readCredentialsFile(endpoints.configDir)
  const file = result.status === 'ok' ? result.credentials : {}
  const fileProblem =
    result.status === 'missing' || result.status === 'ok'
      ? undefined
      : `${configFile(endpoints.configDir)} could not be read: ${result.detail}`

  const clientId = pick(env.FINANCY_CLIENT_ID, file.clientId)
  const clientSecret = pick(env.FINANCY_CLIENT_SECRET, file.clientSecret)
  const userId = pick(env.FINANCY_USER_ID, file.userId)

  const missing: string[] = []
  if (!clientId) missing.push('FINANCY_CLIENT_ID')
  if (!clientSecret) missing.push('FINANCY_CLIENT_SECRET')
  if (!userId) missing.push('FINANCY_USER_ID')
  if (!clientId || !clientSecret || !userId) return { ok: false, missing, fileProblem }

  return {
    ok: true,
    config: { clientId, clientSecret, userId, ...endpoints },
  }
}

/** The NOT_CONFIGURED error every data command raises, with the file problem when there is one. */
export function notConfigured(result: Extract<ConfigResult, { ok: false }>): CliError {
  const suffix = result.fileProblem ? ` — ${result.fileProblem}` : ''
  return new CliError(
    EXIT.AUTH,
    'NOT_CONFIGURED',
    `missing ${result.missing.join(', ')} — run financy setup${suffix}`,
  )
}
