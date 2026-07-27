/**
 * Visible width of a string in a monospace terminal, counting by code point:
 * combining marks / zero-width code points count 0, East-Asian wide & fullwidth
 * count 2, everything else counts 1. Used instead of `String.length` so tables
 * with Hebrew (incl. niqqud combining marks) and other scripts align.
 */
export function displayWidth(str: string): number {
  let width = 0
  for (const ch of str) {
    const cp = ch.codePointAt(0)!
    if (isZeroWidth(cp)) continue
    width += isWide(cp) ? 2 : 1
  }
  return width
}

function isZeroWidth(cp: number): boolean {
  return (
    cp === 0x200b || // zero-width space
    (cp >= 0x200c && cp <= 0x200f) || // ZWNJ/ZWJ/LRM/RLM
    cp === 0xfeff || // BOM / zero-width no-break space
    // Combining marks
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacritics
    (cp >= 0x0591 && cp <= 0x05bd) || // Hebrew accents & niqqud
    cp === 0x05bf ||
    (cp >= 0x05c1 && cp <= 0x05c2) ||
    (cp >= 0x05c4 && cp <= 0x05c5) ||
    cp === 0x05c7 ||
    (cp >= 0x0610 && cp <= 0x061a) || // Arabic marks
    (cp >= 0x064b && cp <= 0x065f) ||
    cp === 0x0670 ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe20 && cp <= 0xfe2f)
  )
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals, Kangxi
    (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana … CJK symbols
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compatibility forms
    (cp >= 0xff00 && cp <= 0xff60) || // Fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) || // emoji & pictographs
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK Ext B+
  )
}

export interface Column<T> {
  header: string
  value: (row: T) => string
}

const GAP = '  '

/** Coerce a possibly-missing cell value to a safe display string (never throws). */
function cell<T>(col: Column<T>, row: T): string {
  const v = col.value(row)
  return v == null ? '' : String(v)
}

/** Pad `str` on the right with spaces to `width` visible columns. */
function padDisplay(str: string, width: number): string {
  return str + ' '.repeat(Math.max(0, width - displayWidth(str)))
}

/** Render rows as a left-aligned, display-width-padded table (header + rows), newline-terminated. */
export function renderTable<T>(rows: T[], columns: Column<T>[]): string {
  const widths = columns.map((col) =>
    Math.max(displayWidth(col.header), ...rows.map((r) => displayWidth(cell(col, r)))),
  )
  const line = (cells: string[]) =>
    cells.map((c, i) => padDisplay(c, widths[i]!)).join(GAP).trimEnd()

  const lines = [
    line(columns.map((c) => c.header)),
    ...rows.map((r) => line(columns.map((c) => cell(c, r)))),
  ]
  return lines.join('\n') + '\n'
}
