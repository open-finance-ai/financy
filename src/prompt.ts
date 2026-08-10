import { createInterface } from 'node:readline'
import type { Prompt } from './run.js'
import { sanitizeCredential } from './credentials.js'

export interface PromptInput extends NodeJS.ReadableStream {
  isTTY?: boolean
  setRawMode?: (mode: boolean) => unknown
}

export interface PromptOutput {
  write: (chunk: string) => unknown
}

// Named so no raw control byte appears in this source.
const CTRL_C = String.fromCharCode(3)
const CTRL_U = String.fromCharCode(21)
const ESC = String.fromCharCode(27)
const BACKSPACE = String.fromCharCode(8)
const DEL = String.fromCharCode(127)

/** Ctrl+C in raw mode does not raise SIGINT — we exit with the conventional code. */
const SIGINT_EXIT = 130

const PASTE_HINT =
  'note: a keystroke that entered no text was ignored. If you meant to paste and\n' +
  'nothing appeared, this console does not paste with Ctrl+V — use right-click or\n' +
  'Ctrl+Shift+V, or type the value.\n'

/**
 * Read one line, echoed by the terminal itself (cooked mode). readline runs with
 * `terminal: false` deliberately: its line editor rewrites the whole line on
 * every keystroke, which behaves differently across Windows consoles, and we
 * need none of it to collect a single value.
 */
function readLine(prompt: string, input: PromptInput, output: PromptOutput): Promise<string> {
  if (prompt) output.write(prompt)
  const rl = createInterface({ input, terminal: false })
  return new Promise((resolve) => {
    rl.question('', (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

/**
 * Read one line without echoing it, printing `*` per accepted character.
 *
 * Characters are consumed one at a time in raw mode, so the value is exactly
 * what we accepted — nothing depends on readline's internal write path. The
 * visible `*`s matter as much as the masking: a paste the console silently
 * dropped now shows as an empty prompt, instead of being submitted as a mangled
 * secret and coming back later as an opaque 401.
 */
function readMasked(
  prompt: string,
  input: PromptInput,
  output: PromptOutput,
): Promise<string> {
  output.write(prompt)
  input.setRawMode?.(true)
  input.setEncoding('utf8')
  input.resume()

  return new Promise((resolve) => {
    let value = ''
    let ignoredControl = false
    // Arrow keys and friends arrive as ESC [ <letter>: the bracket and letter are
    // printable and would otherwise be stored as part of the value.
    let inEscape = false

    const cleanup = () => {
      input.removeListener('data', onData)
      input.setRawMode?.(false)
      input.pause()
    }

    const erase = (count: number) => {
      if (count > 0) output.write(`${BACKSPACE} ${BACKSPACE}`.repeat(count))
    }

    const onData = (chunk: string | Buffer) => {
      for (const ch of String(chunk)) {
        if (inEscape) {
          if (/[A-Za-z~]/.test(ch)) inEscape = false
          continue
        }
        if (ch === '\r' || ch === '\n') {
          cleanup()
          output.write('\n')
          if (ignoredControl) output.write(PASTE_HINT)
          resolve(value)
          return
        }
        if (ch === CTRL_C) {
          cleanup()
          output.write('\n')
          process.exit(SIGINT_EXIT)
        }
        if (ch === DEL || ch === BACKSPACE) {
          if (value.length > 0) {
            value = value.slice(0, -1)
            erase(1)
          }
          continue
        }
        if (ch === CTRL_U) {
          erase(value.length)
          value = ''
          continue
        }
        if (ch === ESC) {
          inEscape = true
          continue
        }
        if (isControlChar(ch)) {
          // Notably Ctrl+V on the Windows legacy console, which does not paste:
          // it delivers a bare control byte that must not land in the value.
          ignoredControl = true
          continue
        }
        value += ch
        output.write('*')
      }
    }

    input.on('data', onData)
  })
}

function isControlChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return code < 0x20 || code === 0x7f
}

/**
 * The interactive prompt. Secret answers are masked when the input is a TTY;
 * when it is not (a pipe, or a Git Bash / mintty session where Node sees stdin
 * as a pipe) masking is impossible, so we say so instead of pretending — a
 * prompt that looks masked but is not is worse than a visibly unmasked one.
 *
 * Every answer goes through `sanitizeCredential`, so a stray wrapping quote or
 * trailing space cannot reach the token endpoint and come back as a 401.
 */
export function createDefaultPrompt(
  input: PromptInput = process.stdin,
  output: PromptOutput = process.stdout,
): Prompt {
  return async ({ label, secret }) => {
    if (!secret) return sanitizeCredential(await readLine(`${label}: `, input, output))
    if (!input.isTTY) {
      const prompt = `${label} (not masked — this terminal cannot hide input): `
      return sanitizeCredential(await readLine(prompt, input, output))
    }
    return sanitizeCredential(await readMasked(`${label}: `, input, output))
  }
}
