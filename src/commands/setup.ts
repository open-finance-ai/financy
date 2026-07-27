import { join } from 'node:path'
import {
  resolveEndpoints,
  writeCredentialsFile,
  type Config,
  type Credentials,
} from '../config.js'
import { mintToken } from '../auth.js'
import { getConnections } from '../api.js'
import { CliError } from '../errors.js'
import { EXIT } from '../exit-codes.js'
import type { Prompt } from '../run.js'

export interface SetupContext {
  env: NodeJS.ProcessEnv
  noInput: boolean
  prompt: Prompt
  out: (chunk: string) => void
  err: (chunk: string) => void
}

/** Where the three credential values come from — shown before interactive prompts. */
const CREDENTIALS_GUIDE =
  'financy needs your Financy API credentials: clientId, clientSecret, and userId.\n' +
  'Find them in the Financy app → Settings → API.\n' +
  'This requires a registered Financy account on a paid plan (Starter or Pro) —\n' +
  'the data API is not available on the free plan. Sign up at https://open-finance.ai\n\n'

/** `financy setup` — collect credentials, validate them, and persist to the config file. */
export async function setupCommand(ctx: SetupContext): Promise<number> {
  if (!ctx.noInput) ctx.out(CREDENTIALS_GUIDE)
  const credentials = ctx.noInput
    ? credentialsFromEnv(ctx.env)
    : await credentialsFromPrompts(ctx.prompt)

  const endpoints = resolveEndpoints(ctx.env)
  const config: Config = { ...credentials, ...endpoints }

  ctx.out('Validating…\n')
  try {
    const token = await mintToken(config)
    await getConnections(config, token)
  } catch (error) {
    // Free-plan 403: the credentials are valid but the plan is ineligible. Persist
    // them so a later upgrade "just works", then surface the ineligibility (exit 4).
    if (error instanceof CliError && error.code === 'NOT_AVAILABLE_ON_PLAN') {
      await writeCredentialsFile(endpoints.configDir, credentials)
    }
    // Bad credentials (exit 3) / network (exit 7): do not persist.
    throw error
  }

  await writeCredentialsFile(endpoints.configDir, credentials)
  ctx.out(
    `✓ Saved to ${join(endpoints.configDir, 'config.json')} (permissions 600)\n\nTry: financy status\n`,
  )
  return EXIT.OK
}

function credentialsFromEnv(env: NodeJS.ProcessEnv): Credentials {
  const clientId = env.FINANCY_CLIENT_ID
  const clientSecret = env.FINANCY_CLIENT_SECRET
  const userId = env.FINANCY_USER_ID
  if (!clientId || !clientSecret || !userId) {
    throw new CliError(
      EXIT.USAGE,
      'NOT_CONFIGURED',
      '--no-input requires FINANCY_CLIENT_ID, FINANCY_CLIENT_SECRET, and FINANCY_USER_ID',
    )
  }
  return { clientId, clientSecret, userId }
}

async function credentialsFromPrompts(prompt: Prompt): Promise<Credentials> {
  const clientId = await prompt({ label: 'Client ID' })
  const clientSecret = await prompt({ label: 'Client secret', secret: true })
  const userId = await prompt({ label: 'User ID' })
  return { clientId, clientSecret, userId }
}
