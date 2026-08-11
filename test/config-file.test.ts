import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runCli } from './helpers/run-cli.js'
import { testConfigDir } from './setup.js'
import { sanitizeCredential } from '../src/credentials.js'
import { loadConfig, readCredentialsFile } from '../src/config.js'

const PROFILE = {
  profiles: { default: { clientId: 'cid', clientSecret: 'sec', userId: 'uid' } },
}

function writeConfig(bytes: Buffer | string): string {
  const dir = testConfigDir()
  writeFileSync(join(dir, 'config.json'), bytes)
  return dir
}

describe('config file encodings', () => {
  it('reads plain UTF-8', async () => {
    const dir = writeConfig(JSON.stringify(PROFILE))
    const result = await readCredentialsFile(dir)
    expect(result).toEqual({ status: 'ok', credentials: PROFILE.profiles.default })
  })

  it('reads UTF-8 with a BOM (PowerShell Set-Content)', async () => {
    const dir = writeConfig(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(PROFILE))]),
    )
    const result = await readCredentialsFile(dir)
    expect(result).toEqual({ status: 'ok', credentials: PROFILE.profiles.default })
  })

  it('reads UTF-16LE with a BOM (PowerShell 5.1 redirection)', async () => {
    const dir = writeConfig(
      Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from(JSON.stringify(PROFILE), 'utf16le'),
      ]),
    )
    const result = await readCredentialsFile(dir)
    expect(result).toEqual({ status: 'ok', credentials: PROFILE.profiles.default })
  })
})

describe('config file problems are named, not swallowed', () => {
  it('distinguishes a missing file from an unusable one', async () => {
    expect(await readCredentialsFile(testConfigDir())).toEqual({ status: 'missing' })
  })

  it('reports invalid JSON', async () => {
    const dir = writeConfig('{ not json')
    const result = await readCredentialsFile(dir)
    expect(result.status).toBe('malformed')
  })

  it('reports a flat file that is missing profiles.default', async () => {
    const dir = writeConfig(JSON.stringify({ clientId: 'cid', clientSecret: 'sec' }))
    const result = await readCredentialsFile(dir)
    expect(result).toMatchObject({ status: 'malformed' })
    if (result.status === 'malformed') expect(result.detail).toContain('profiles.default')
  })

  it('surfaces the file problem in the NOT_CONFIGURED error instead of only "missing"', async () => {
    writeConfig('{ not json')
    const { code, stderr } = await runCli(['status'], { env: {} })

    expect(code).toBe(3)
    expect(stderr).toContain('could not be read')
  })

  it('shows the file status in financy config', async () => {
    writeConfig('{ not json')
    const { stdout } = await runCli(['config', '--json'], { env: {} })

    expect(JSON.parse(stdout).configFileStatus).toContain('malformed')
  })
})

describe('credential normalization', () => {
  it.each([
    ['trailing space from a copied line', 'sec ', 'sec'],
    ['leading and trailing whitespace', '  sec\t', 'sec'],
    ['double quotes kept by cmd set X="v"', '"sec"', 'sec'],
    ['single quotes', "'sec'", 'sec'],
    ['a stray control byte', `sec${String.fromCharCode(22)}`, 'sec'],
    ['a trailing carriage return', 'sec\r', 'sec'],
  ])('strips %s', (_name, raw, expected) => {
    expect(sanitizeCredential(raw)).toBe(expected)
  })

  it('normalizes env credentials so a pasted quote cannot cause a 401', async () => {
    const result = await loadConfig({
      FINANCY_CLIENT_ID: '"cid"',
      FINANCY_CLIENT_SECRET: 'sec ',
      FINANCY_USER_ID: ' uid\r',
      FINANCY_CONFIG_DIR: testConfigDir(),
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config).toMatchObject({ clientId: 'cid', clientSecret: 'sec', userId: 'uid' })
    }
  })

  it('treats a whitespace-only env credential as unset rather than sending it', async () => {
    const result = await loadConfig({
      FINANCY_CLIENT_ID: 'cid',
      FINANCY_CLIENT_SECRET: '   ',
      FINANCY_USER_ID: 'uid',
      FINANCY_CONFIG_DIR: testConfigDir(),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.missing).toEqual(['FINANCY_CLIENT_SECRET'])
  })
})
