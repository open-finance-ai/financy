import { describe, it, expect } from 'vitest'
import { runCli } from './helpers/run-cli.js'

describe('unknown command', () => {
  it('exits 2 (usage error) with an error message on stderr and nothing on stdout', async () => {
    const { code, stdout, stderr } = await runCli(['frobnicate'])

    expect(code).toBe(2)
    expect(stdout).toBe('')
    expect(stderr).toMatch(/unknown command/i)
    expect(stderr).toContain('frobnicate')
  })
})
