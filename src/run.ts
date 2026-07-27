import { Command, CommanderError } from 'commander'
import { loadConfig } from './config.js'
import { statusCommand } from './commands/status.js'
import { setupCommand } from './commands/setup.js'
import { configCommand } from './commands/config.js'
import { refreshCommand } from './commands/refresh.js'
import { registerReadCommands } from './commands/read-commands.js'
import { createDefaultPrompt } from './prompt.js'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { detectInstallMode, unsupportedNode, updateCommand, spawnExec } from './update.js'
import { EXIT } from './exit-codes.js'
import { CliError } from './errors.js'
import { VERSION } from './version.js'

export { EXIT }

export type Prompt = (question: { label: string; secret?: boolean }) => Promise<string>

export interface RunIO {
  /** Environment the command reads credentials/config from. Defaults to process.env. */
  env?: NodeJS.ProcessEnv
  /** Sink for standard output. Defaults to writing to process.stdout. */
  stdout?: (chunk: string) => void
  /** Sink for standard error. Defaults to writing to process.stderr. */
  stderr?: (chunk: string) => void
  /** The current time, injectable for deterministic freshness output. Defaults to now. */
  now?: Date
  /** Interactive prompt provider, injectable in tests. Defaults to a readline prompt. */
  prompt?: Prompt
  /** The running Node version, injectable in tests. Defaults to process.versions.node. */
  nodeVersion?: string
  /** Command runner for `update` (global mode), injectable in tests. Defaults to spawning. */
  exec?: (cmd: string, args: string[]) => Promise<number>
}

/**
 * The CLI process boundary. Parses `argv` (without the node/script prefix) via
 * commander and resolves the process exit code. All output goes through the
 * injected sinks so behavior is observable in tests without spawning a subprocess.
 */
export async function run(argv: string[], io: RunIO = {}): Promise<number> {
  const out = io.stdout ?? ((chunk) => void process.stdout.write(chunk))
  const err = io.stderr ?? ((chunk) => void process.stderr.write(chunk))
  const env = io.env ?? process.env
  const now = io.now ?? new Date()
  const prompt = io.prompt ?? createDefaultPrompt()
  const json = argv.includes('--json')

  // Friendly runtime floor check, before commander touches anything.
  const nodeError = unsupportedNode(io.nodeVersion ?? process.versions.node)
  if (nodeError) {
    err(`error: ${nodeError}\n`)
    return EXIT.UNEXPECTED
  }

  const program = new Command()
  program
    .name('financy')
    .description('financy — your Open-Finance data, in the terminal')
    .version(VERSION, '-v, --version', 'print the version')
    .configureOutput({ writeOut: out, writeErr: err })
    .exitOverride()
    .showSuggestionAfterError(false)

  let exitCode: number = EXIT.OK

  program
    .command('status')
    .description('Are my connections fresh? One-line-per-bank rollup')
    .option('--json', 'machine-readable output (stable schema, errors as JSON on stderr)')
    .action(async () => {
      const result = await loadConfig(env)
      if (!result.ok) {
        throw new CliError(
          EXIT.AUTH,
          'NOT_CONFIGURED',
          `missing ${result.missing.join(', ')} — run financy setup`,
        )
      }
      exitCode = await statusCommand({ config: result.config, json, now, out, err })
    })

  program
    .command('setup')
    .description('Save your API credentials (from Financy → Settings → API)')
    .option('--no-input', 'read credentials from FINANCY_* env vars (for agents/CI)')
    .action(async (opts: { input?: boolean }) => {
      exitCode = await setupCommand({
        env,
        noInput: opts.input === false,
        prompt,
        out,
        err,
      })
    })

  program
    .command('refresh')
    .description('Trigger an on-demand refresh of all connections (20 credits)')
    .option('--json', 'machine-readable output')
    .action(async () => {
      const result = await loadConfig(env)
      if (!result.ok) {
        throw new CliError(
          EXIT.AUTH,
          'NOT_CONFIGURED',
          `missing ${result.missing.join(', ')} — run financy setup`,
        )
      }
      exitCode = await refreshCommand({ config: result.config, json, now, out })
    })

  program
    .command('config')
    .description('Show the resolved endpoints and credential sources (secret masked)')
    .option('--json', 'machine-readable output')
    .action(async () => {
      exitCode = await configCommand({ env, json, out })
    })

  program
    .command('mcp')
    .description('Run the embedded MCP server (stdio) exposing the CLI as agent tools')
    .action(async () => {
      // Lazy-load the MCP SDK so it never costs the normal CLI path startup time.
      const { startMcpServer } = await import('./mcp/server.js')
      await startMcpServer(env)
    })

  program
    .command('update')
    .description('Update the CLI to the latest version')
    .action(async () => {
      const mode = detectInstallMode({
        moduleDir: dirname(fileURLToPath(import.meta.url)),
        cwd: process.cwd(),
        userAgent: env.npm_config_user_agent,
      })
      exitCode = await updateCommand({ mode, exec: io.exec ?? spawnExec, out, err })
    })

  registerReadCommands(program, { env, now, json, out }, (code) => {
    exitCode = code
  })

  // No command → show help and exit 0 (parity with the locked prototype's default).
  if (argv.length === 0) {
    program.outputHelp()
    return EXIT.OK
  }

  try {
    await program.parseAsync(argv, { from: 'user' })
    return exitCode
  } catch (error) {
    if (error instanceof CommanderError) {
      return mapCommanderError(error)
    }
    return emitError({ err, json }, error)
  }
}

/** Map commander's own exit conditions to our exit-code contract. */
function mapCommanderError(error: CommanderError): number {
  switch (error.code) {
    case 'commander.helpDisplayed':
    case 'commander.help':
    case 'commander.version':
      return EXIT.OK
    default:
      // unknown command/option, missing/excess argument → usage error.
      return EXIT.USAGE
  }
}

/** Render an error (JSON envelope on stderr under --json, else a one-liner) and return its exit code. */
function emitError(
  io: { err: (chunk: string) => void; json: boolean },
  error: unknown,
): number {
  const cliError =
    error instanceof CliError
      ? error
      : new CliError(EXIT.UNEXPECTED, 'UNEXPECTED', String((error as Error)?.message ?? error))

  if (io.json) {
    io.err(
      JSON.stringify({
        error: { code: cliError.code, message: cliError.message, ...cliError.extra },
      }),
    )
  } else {
    io.err(`error ${cliError.code}: ${cliError.message}\n`)
  }
  return cliError.exitCode
}
