import { describe, it, expect, vi } from 'vitest'
import { detectInstallMode, unsupportedNode, updateCommand } from '../src/update.js'
import { runCli } from './helpers/run-cli.js'

describe('detectInstallMode', () => {
  it('detects npx from an _npx cache path', () => {
    expect(
      detectInstallMode({
        moduleDir: '/Users/x/.npm/_npx/abc123/node_modules/financy/dist',
        cwd: '/Users/x/project',
      }),
    ).toBe('npx')
  })

  it('detects npx from the npm_config_user_agent', () => {
    expect(
      detectInstallMode({
        moduleDir: '/somewhere/node_modules/financy/dist',
        cwd: '/Users/x/project',
        userAgent: 'npm/10.2.4 node/v20.11.0 darwin arm64 npx/10.2.4',
      }),
    ).toBe('npx')
  })

  it('detects a local project dependency when installed under the cwd tree', () => {
    expect(
      detectInstallMode({
        moduleDir: '/Users/x/project/node_modules/financy/dist',
        cwd: '/Users/x/project/src',
      }),
    ).toBe('local')
  })

  it('detects a global install (node_modules outside the project tree)', () => {
    expect(
      detectInstallMode({
        moduleDir: '/usr/local/lib/node_modules/financy/dist',
        cwd: '/Users/x/project',
      }),
    ).toBe('global')
  })
})

describe('unsupportedNode', () => {
  it('rejects a Node below the floor with a clear message', () => {
    const msg = unsupportedNode('v18.19.0', 20)
    expect(msg).toMatch(/Node 20/)
    expect(msg).toContain('v18.19.0')
  })

  it('accepts a Node at or above the floor', () => {
    expect(unsupportedNode('v20.11.0', 20)).toBeNull()
    expect(unsupportedNode('v22.3.0', 20)).toBeNull()
  })

  it('does not block when the version is unparseable', () => {
    expect(unsupportedNode('weird', 20)).toBeNull()
  })
})

describe('updateCommand', () => {
  function ctx(mode: 'global' | 'npx' | 'local', exec = vi.fn()) {
    let out = ''
    let err = ''
    return {
      mode,
      exec,
      out: (s: string) => (out += s),
      err: (s: string) => (err += s),
      get stdout() {
        return out
      },
      get stderr() {
        return err
      },
    }
  }

  it('npx mode: says nothing to update and never execs', async () => {
    const c = ctx('npx')
    const code = await updateCommand(c)
    expect(code).toBe(0)
    expect(c.stdout).toMatch(/npx/i)
    expect(c.exec).not.toHaveBeenCalled()
  })

  it('local mode: defers to the project and never execs', async () => {
    const c = ctx('local')
    const code = await updateCommand(c)
    expect(code).toBe(0)
    expect(c.stdout).toMatch(/project dependency|npm update/i)
    expect(c.exec).not.toHaveBeenCalled()
  })

  it('global mode: runs the global npm install and exits 0 on success', async () => {
    const exec = vi.fn().mockResolvedValue(0)
    const c = ctx('global', exec)
    const code = await updateCommand(c)
    expect(code).toBe(0)
    expect(exec).toHaveBeenCalledWith('npm', ['install', '-g', 'financy@latest'])
  })

  it('global mode: exits 1 with guidance when the install fails', async () => {
    const exec = vi.fn().mockResolvedValue(1)
    const c = ctx('global', exec)
    const code = await updateCommand(c)
    expect(code).toBe(1)
    expect(c.stderr).toMatch(/npm install -g financy/)
  })
})

describe('run() Node version gate', () => {
  it('exits 1 with a clear message when Node is below the supported floor', async () => {
    const { code, stderr } = await runCli(['status'], { nodeVersion: 'v18.19.0' })
    expect(code).toBe(1)
    expect(stderr).toMatch(/Node 20/)
  })

  it('runs normally on a supported Node', async () => {
    // `financy` with no command prints help and exits 0.
    const { code } = await runCli([], { nodeVersion: 'v22.3.0' })
    expect(code).toBe(0)
  })
})

describe('financy update (through run)', () => {
  it('is a real command that dispatches to the injected runner and exits 0', async () => {
    // In-process the CLI resolves to a global-style install (src/ has no
    // node_modules ancestor), so update() invokes the runner — which we fake so
    // no real `npm install -g` is spawned.
    const exec = vi.fn().mockResolvedValue(0)
    const { code, stdout, stderr } = await runCli(['update'], { exec })

    expect(code).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).not.toMatch(/not implemented/i)
    expect(exec).toHaveBeenCalledWith('npm', ['install', '-g', 'financy@latest'])
  })
})
