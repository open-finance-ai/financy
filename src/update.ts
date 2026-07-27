import { spawn } from 'node:child_process'

/** The lowest Node major the CLI supports (kept in sync with package.json `engines`). */
export const MIN_NODE_MAJOR = 20

export type InstallMode = 'global' | 'npx' | 'local'

export interface InstallSignals {
  /** Directory the CLI's code is installed in (from `import.meta.url`). */
  moduleDir: string
  /** The process working directory. */
  cwd: string
  /** `npm_config_user_agent`, if present. */
  userAgent?: string
}

/**
 * Classify how the CLI was invoked:
 * - **npx**: run from the npx cache (`/_npx/`) or with `npx/` in the user agent.
 * - **local**: installed in a `node_modules` inside the current project tree.
 * - **global**: everything else (installed under a global prefix's node_modules).
 */
export function detectInstallMode(signals: InstallSignals): InstallMode {
  const dir = signals.moduleDir
  if (dir.includes('/_npx/') || /(?:^|\s)npx\//.test(signals.userAgent ?? '')) {
    return 'npx'
  }
  const nm = dir.lastIndexOf('/node_modules/')
  if (nm >= 0) {
    const projectRoot = dir.slice(0, nm)
    if (signals.cwd === projectRoot || signals.cwd.startsWith(projectRoot + '/')) {
      return 'local'
    }
  }
  return 'global'
}

/**
 * Return a friendly error message if `nodeVersion` (e.g. `process.versions.node`)
 * is below `min`, otherwise null. An unparseable version never blocks.
 */
export function unsupportedNode(nodeVersion: string, min = MIN_NODE_MAJOR): string | null {
  const major = Number(nodeVersion.replace(/^v/, '').split('.')[0])
  if (Number.isNaN(major)) return null
  if (major < min) {
    return `financy requires Node ${min}+ (you have ${nodeVersion}). Please upgrade Node and try again.`
  }
  return null
}

export interface UpdateContext {
  mode: InstallMode
  /** Run a command, resolving to its exit code. Injected for testing. */
  exec: (cmd: string, args: string[]) => Promise<number>
  out: (chunk: string) => void
  err: (chunk: string) => void
}

const PACKAGE = '@open-finance/cli'

/** `financy update` — behaves per install mode (see {@link detectInstallMode}). */
export async function updateCommand(ctx: UpdateContext): Promise<number> {
  switch (ctx.mode) {
    case 'npx':
      ctx.out('npx always runs the latest — nothing to update.\n')
      return 0
    case 'local':
      ctx.out(
        `financy is a project dependency — update it in your project (e.g. npm update ${PACKAGE}).\n`,
      )
      return 0
    case 'global': {
      ctx.out('Updating financy to the latest version…\n')
      const code = await ctx.exec('npm', ['install', '-g', `${PACKAGE}@latest`])
      if (code !== 0) {
        ctx.err(`update failed — try running: npm install -g ${PACKAGE}@latest\n`)
        return 1
      }
      ctx.out('financy is now up to date.\n')
      return 0
    }
  }
}

/** Default exec: spawn the command inheriting stdio, resolving to its exit code. */
export function spawnExec(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit' })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}
