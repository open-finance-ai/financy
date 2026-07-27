import { beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Every test gets a fresh, isolated config dir so the token cache never leaks
// across tests or touches the developer's real ~/.config/financy.
let current: string | undefined

export function testConfigDir(): string {
  if (!current) throw new Error('testConfigDir() called outside a test')
  return current
}

beforeEach(() => {
  current = mkdtempSync(join(tmpdir(), 'financy-test-'))
})

afterEach(() => {
  if (current) rmSync(current, { recursive: true, force: true })
  current = undefined
})
