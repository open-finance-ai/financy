import { run, type Prompt } from '../../src/run.js'
import { testConfigDir } from '../setup.js'

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

/**
 * Invoke the CLI through its `run()` boundary with an isolated environment,
 * capturing everything written to stdout/stderr. Nothing leaks to the real
 * process streams or the ambient environment.
 */
export async function runCli(
  argv: string[],
  opts: {
    env?: NodeJS.ProcessEnv
    now?: Date
    prompt?: Prompt
    nodeVersion?: string
    exec?: (cmd: string, args: string[]) => Promise<number>
    skillsRoot?: string
    cwd?: string
  } = {},
): Promise<RunResult> {
  let stdout = ''
  let stderr = ''
  const env = { ...opts.env }
  // Default to the per-test isolated config dir unless a test pins one (e.g. to
  // share a token cache across invocations).
  if (!env.FINANCY_CONFIG_DIR) env.FINANCY_CONFIG_DIR = testConfigDir()
  const code = await run(argv, {
    env,
    now: opts.now,
    prompt: opts.prompt,
    nodeVersion: opts.nodeVersion,
    exec: opts.exec,
    skillsRoot: opts.skillsRoot,
    cwd: opts.cwd,
    stdout: (chunk) => {
      stdout += chunk
    },
    stderr: (chunk) => {
      stderr += chunk
    },
  })
  return { code, stdout, stderr }
}
