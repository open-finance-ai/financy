import { describe, it, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import { createDefaultPrompt, type PromptInput } from '../src/prompt.js'

const CTRL_V = String.fromCharCode(22)
const CTRL_C = String.fromCharCode(3)
const DEL = String.fromCharCode(127)
const ESC = String.fromCharCode(27)

type FakeInput = PassThrough & PromptInput & { raw: boolean[] }

/** A fake stdin. `isTTY` decides which read path the prompt takes. */
function fakeInput(isTTY: boolean): FakeInput {
  const stream = new PassThrough() as FakeInput
  stream.isTTY = isTTY
  stream.raw = []
  stream.setRawMode = (mode: boolean) => {
    stream.raw.push(mode)
    return stream
  }
  return stream
}

function fakeOutput() {
  const chunks: string[] = []
  return { write: (c: string) => chunks.push(c), text: () => chunks.join('') }
}

describe('masked prompt on a TTY', () => {
  it('reads the typed value, echoes only asterisks, and restores cooked mode', async () => {
    const input = fakeInput(true)
    const output = fakeOutput()
    const answer = createDefaultPrompt(input, output)({ label: 'Client secret', secret: true })

    input.write('s3cret\r')

    expect(await answer).toBe('s3cret')
    const text = output.text()
    expect(text).not.toContain('s3cret')
    expect(text).toContain('******')
    // Raw mode must be turned back off, or every later prompt misbehaves.
    expect(input.raw).toEqual([true, false])
  })

  it('drops a Ctrl+V that the console did not turn into a paste, and says so', async () => {
    // The Windows legacy console does not paste on Ctrl+V: it delivers a bare
    // control byte. Storing it produced a secret that failed with an opaque 401.
    const input = fakeInput(true)
    const output = fakeOutput()
    const answer = createDefaultPrompt(input, output)({ label: 'Client secret', secret: true })

    input.write(`${CTRL_V}abc\r`)

    expect(await answer).toBe('abc')
    expect(output.text()).toMatch(/does not paste with Ctrl\+V/)
  })

  it('swallows arrow-key escape sequences instead of storing them', async () => {
    const input = fakeInput(true)
    const output = fakeOutput()
    const answer = createDefaultPrompt(input, output)({ label: 'Client secret', secret: true })

    input.write(`ab${ESC}[Ac\r`)

    expect(await answer).toBe('abc')
  })

  it('applies backspace to the value and the echo alike', async () => {
    const input = fakeInput(true)
    const output = fakeOutput()
    const answer = createDefaultPrompt(input, output)({ label: 'Client secret', secret: true })

    input.write(`abX${DEL}c\r`)

    expect(await answer).toBe('abc')
    expect(output.text()).not.toContain('X')
  })

  it('accepts a paste that arrives as one chunk, including a trailing CRLF', async () => {
    const input = fakeInput(true)
    const output = fakeOutput()
    const answer = createDefaultPrompt(input, output)({ label: 'Client secret', secret: true })

    input.write('pasted-secret\r\n')

    expect(await answer).toBe('pasted-secret')
  })

  it('strips wrapping quotes and surrounding whitespace', async () => {
    const input = fakeInput(true)
    const output = fakeOutput()
    const answer = createDefaultPrompt(input, output)({ label: 'Client ID', secret: true })

    input.write('  "cid-123"  \r')

    expect(await answer).toBe('cid-123')
  })
})

describe('masked prompt without a TTY', () => {
  it('says the input is not masked rather than pretending it is', async () => {
    // Git Bash / mintty hand Node a pipe, not a TTY: hidden input is impossible.
    const input = fakeInput(false)
    const output = fakeOutput()
    const answer = createDefaultPrompt(input, output)({ label: 'Client secret', secret: true })

    input.write('typed-in-the-clear\n')

    expect(await answer).toBe('typed-in-the-clear')
    expect(output.text()).toMatch(/not masked/)
    // No raw-mode toggling on a stream that cannot support it.
    expect(input.raw).toEqual([])
  })
})

describe('plain prompt', () => {
  it('reads a line and normalizes it', async () => {
    const input = fakeInput(true)
    const output = fakeOutput()
    const answer = createDefaultPrompt(input, output)({ label: 'User ID' })

    input.write('  uid-9  \n')

    expect(await answer).toBe('uid-9')
    expect(output.text()).toContain('User ID: ')
  })
})

describe('Ctrl+C', () => {
  it('is handled rather than stored in the value', async () => {
    // Raw mode suppresses SIGINT, so the prompt must act on the byte itself
    // rather than storing it as text. process.exit is stubbed because a real one
    // would take the test runner with it.
    const input = fakeInput(true)
    const output = fakeOutput()
    const exit = process.exit
    let exitCode: number | undefined
    process.exit = ((code?: number) => {
      exitCode = code
      throw new Error('exit')
    }) as typeof process.exit
    try {
      createDefaultPrompt(input, output)({ label: 'Client secret', secret: true })
      expect(() => input.write(CTRL_C)).toThrow('exit')
    } finally {
      process.exit = exit
    }
    expect(exitCode).toBe(130)
  })
})
