/** C0 control characters and DEL — never part of a credential. */
function isControl(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return code < 0x20 || code === 0x7f
}

/**
 * Normalize a credential value from any source (an interactive prompt, an env
 * var, the config file) before it is used.
 *
 * Every transformation here exists because a real paste or shell idiom produced
 * a value that looked right to the user and was rejected with a 401:
 * - control characters, e.g. the raw 0x16 byte the Windows legacy console
 *   delivers for Ctrl+V instead of pasting;
 * - surrounding whitespace, e.g. a trailing space copied along with the line,
 *   which `set X=v ` in cmd keeps inside the value;
 * - one layer of wrapping quotes, which `set X="v"` in cmd also keeps.
 */
export function sanitizeCredential(raw: string): string {
  const stripped = Array.from(raw)
    .filter((ch) => !isControl(ch))
    .join('')
    .trim()
  const quoted = /^(["'])(.*)\1$/.exec(stripped)
  return (quoted?.[2] ?? stripped).trim()
}
