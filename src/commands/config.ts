import { resolveEndpoints, readCredentialsFile } from '../config.js'
import { EXIT } from '../exit-codes.js'

export interface ConfigContext {
  env: NodeJS.ProcessEnv
  json: boolean
  out: (chunk: string) => void
}

type Source = 'env' | 'file' | 'unset'

/** Mask a semi-sensitive id: keep the first/last 4 chars so it's recognizable, never full. */
function maskId(v: string | undefined): string {
  if (!v) return '(unset)'
  return v.length <= 8 ? '****' : `${v.slice(0, 4)}…${v.slice(-4)}`
}

/**
 * `financy config` — show the resolved endpoints and where each credential comes
 * from (env vs the config file), with the secret never printed. Mirrors Plaid
 * CLI's `plaid config` and is the first thing to reach for when auth misbehaves.
 */
export async function configCommand(ctx: ConfigContext): Promise<number> {
  const endpoints = resolveEndpoints(ctx.env)
  const file = (await readCredentialsFile(endpoints.configDir)) ?? {}

  const resolve = (envKey: string, fileVal?: string): { value?: string; source: Source } => {
    const envVal = ctx.env[envKey]
    if (envVal) return { value: envVal, source: 'env' }
    if (fileVal) return { value: fileVal, source: 'file' }
    return { source: 'unset' }
  }
  const clientId = resolve('FINANCY_CLIENT_ID', file.clientId)
  const clientSecret = resolve('FINANCY_CLIENT_SECRET', file.clientSecret)
  const userId = resolve('FINANCY_USER_ID', file.userId)

  if (ctx.json) {
    ctx.out(
      JSON.stringify(
        {
          configDir: endpoints.configDir,
          authTokenUrl: endpoints.authTokenUrl,
          apiBaseUrl: endpoints.apiBaseUrl,
          chatBaseUrl: endpoints.chatBaseUrl,
          clientId: clientId.value ? maskId(clientId.value) : null,
          clientIdSource: clientId.source,
          clientSecretSet: clientSecret.source !== 'unset',
          clientSecretSource: clientSecret.source,
          userId: userId.value ?? null,
          userIdSource: userId.source,
        },
        null,
        2,
      ),
    )
    return EXIT.OK
  }

  const lines = [
    'financy configuration',
    '',
    `  config dir     ${endpoints.configDir}`,
    `  auth url       ${endpoints.authTokenUrl}`,
    `  api url        ${endpoints.apiBaseUrl}`,
    `  chat url       ${endpoints.chatBaseUrl}`,
    '',
    `  clientId       ${maskId(clientId.value)}  (${clientId.source})`,
    `  clientSecret   ${clientSecret.source !== 'unset' ? '•••••••• (set)' : '(unset)'}  (${clientSecret.source})`,
    `  userId         ${userId.value ?? '(unset)'}  (${userId.source})`,
  ]
  ctx.out(lines.join('\n') + '\n')
  return EXIT.OK
}
