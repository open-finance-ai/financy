import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runCli } from './helpers/run-cli.js'
import { testConfigDir } from './setup.js'

describe('financy config', () => {
  it('reports endpoints and per-field sources, never printing the secret', async () => {
    writeFileSync(
      join(testConfigDir(), 'config.json'),
      JSON.stringify({
        profiles: { default: { clientId: 'file-cid-123456', clientSecret: 'TOPSECRET', userId: 'me@x.io' } },
      }),
      { mode: 0o600 },
    )

    const { code, stdout } = await runCli(['config', '--json'], {
      env: { FINANCY_CLIENT_ID: 'env-cid-abcdef' }, // env overrides file for clientId only
    })

    expect(code).toBe(0)
    const cfg = JSON.parse(stdout)
    expect(cfg.clientIdSource).toBe('env')
    expect(cfg.clientSecretSource).toBe('file')
    expect(cfg.clientSecretSet).toBe(true)
    expect(cfg.userId).toBe('me@x.io')
    expect(cfg.userIdSource).toBe('file')
    // The secret must never appear anywhere in the output.
    expect(stdout).not.toContain('TOPSECRET')
    // clientId is masked, not shown in full.
    expect(cfg.clientId).not.toContain('env-cid-abcdef')
    expect(cfg.chatBaseUrl).toContain('/chat/chat')
  })

  it('runs without credentials and marks everything unset', async () => {
    const { code, stdout } = await runCli(['config', '--json'], { env: {} })

    expect(code).toBe(0)
    const cfg = JSON.parse(stdout)
    expect(cfg.clientIdSource).toBe('unset')
    expect(cfg.clientSecretSet).toBe(false)
    expect(cfg.userId).toBeNull()
  })

  it('masks the secret in the human view too', async () => {
    writeFileSync(
      join(testConfigDir(), 'config.json'),
      JSON.stringify({ profiles: { default: { clientId: 'cid', clientSecret: 'TOPSECRET', userId: 'me@x.io' } } }),
      { mode: 0o600 },
    )

    const { code, stdout } = await runCli(['config'], { env: {} })

    expect(code).toBe(0)
    expect(stdout).toContain('config dir')
    expect(stdout).not.toContain('TOPSECRET')
    expect(stdout).toContain('(set)')
  })
})
