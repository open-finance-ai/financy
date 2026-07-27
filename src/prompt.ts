import { createInterface } from 'node:readline'
import type { Prompt } from './run.js'

/**
 * Default interactive prompt backed by readline. For secret questions the typed
 * characters are masked (not echoed). Tests inject their own Prompt instead.
 */
export function createDefaultPrompt(): Prompt {
  return ({ label, secret }) =>
    new Promise((resolve) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      })
      if (secret) {
        const mutable = rl as unknown as { _writeToOutput: (s: string) => void }
        mutable._writeToOutput = (s: string) => {
          // Echo the question and line breaks, suppress the typed secret.
          if (s.includes(label) || s === '\n' || s === '\r\n') process.stdout.write(s)
        }
      }
      rl.question(`${label}: `, (answer) => {
        rl.close()
        if (secret) process.stdout.write('\n')
        resolve(answer.trim())
      })
    })
}
