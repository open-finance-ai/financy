import { describe, expect, it } from 'vitest'
import { renderTable } from '../src/render'

describe('renderTable', () => {
  it('never prints control or bidi characters from the data', () => {
    const name = 'כלב\u001b]52;c;eA==\u0007‮abc​'
    const out = renderTable([{ name }], [{ header: 'CATEGORY', value: (r: { name: string }) => r.name }])

    // Newlines end the table's lines; nothing else from those classes is printed.
    expect(out.replace(/\n/g, '')).not.toMatch(/[\p{Cc}\p{Cf}]/u)
    expect(out).toContain('כלב]52;c;eA==abc')
  })
})
