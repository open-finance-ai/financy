import { describe, it, expect } from 'vitest'
import * as lib from '../src/lib.js'

// This surface is a published API: anything added here has to keep working
// across releases, and anything removed is a breaking change for the remote
// MCP server that consumes it. The exact-match assertion is the point — it
// fails on accidental widening as loudly as on removal.
describe('published library surface', () => {
  it('exports exactly the symbols an out-of-process MCP host needs', () => {
    expect(Object.keys(lib).sort()).toEqual(['TOOLS', 'VERSION', 'bearerConfig', 'callTool'])
  })

  it('serves the same tool table the CLI serves', () => {
    expect(lib.TOOLS.map((t) => t.name)).toContain('get_transaction')
  })

  it('bearerConfig carries the caller token onto a usable config', () => {
    const config = lib.bearerConfig({}, 'tok_123')

    expect(config.bearerToken).toBe('tok_123')
    expect(config.apiBaseUrl).toMatch(/^https?:\/\//)
  })

  it('VERSION tracks the package version', () => {
    expect(lib.VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })
})
