#!/usr/bin/env node
// Manual pre-release smoke test — NOT run in CI. Exercises the core read commands
// and a few exit-code contracts against a live (staging) API with a real paid-org
// M2M credential.
//
// Usage:
//   npm run build
//   FINANCY_CLIENT_ID=... FINANCY_CLIENT_SECRET=... FINANCY_USER_ID=... \
//   FINANCY_AUTH_URL=https://staging.../oauth/token \
//   FINANCY_API_URL=https://staging.../v2 \
//   FINANCY_CHAT_URL=https://staging.../chat \
//   FINANCY_AUDIENCE=https://staging... \
//   node scripts/smoke.mjs
//
// Exits 0 if every check passes, 1 otherwise.

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(root, 'dist', 'bin.js')

const required = ['FINANCY_CLIENT_ID', 'FINANCY_CLIENT_SECRET', 'FINANCY_USER_ID']
const missing = required.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`smoke: missing required env: ${missing.join(', ')}`)
  console.error('Point FINANCY_AUTH_URL / FINANCY_API_URL / FINANCY_CHAT_URL / FINANCY_AUDIENCE at staging.')
  process.exit(1)
}

/** Each check: a label, argv, and the exit code we expect. */
const CHECKS = [
  ['status --json', ['status', '--json'], 0],
  ['connections list --json', ['connections', 'list', '--json'], 0],
  ['accounts list --json', ['accounts', 'list', '--json'], 0],
  ['transactions list --limit 5 --json', ['transactions', 'list', '--limit', '5', '--json'], 0],
  ['providers list --json', ['providers', 'list', '--json'], 0],
  ['categories --json', ['categories', '--json'], 0],
  ['unknown command → usage error', ['frobnicate'], 2],
]

let failed = 0
for (const [label, argv, expected] of CHECKS) {
  const res = spawnSync('node', [BIN, ...argv], { env: process.env, encoding: 'utf8' })
  const code = res.status ?? 1
  const ok = code === expected
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label} — exit ${code} (expected ${expected})`)
  if (!ok && res.stderr) console.log(`    stderr: ${res.stderr.trim().split('\n')[0]}`)
}

console.log(failed === 0 ? '\nsmoke: all checks passed' : `\nsmoke: ${failed} check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
