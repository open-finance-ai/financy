import { describe, it, expect } from 'vitest'
import { runCli } from './helpers/run-cli.js'

describe('financy help', () => {
  it('prints the v1 command tree and exits 0', async () => {
    const { code, stdout, stderr } = await runCli(['help'])

    expect(code).toBe(0)
    expect(stderr).toBe('')
    for (const command of [
      'setup',
      'status',
      'connections',
      'accounts',
      'transactions',
      'refresh',
      'update',
    ]) {
      expect(stdout).toContain(command)
    }
  })
})
