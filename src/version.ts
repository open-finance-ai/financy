import pkg from '../package.json' with { type: 'json' }

// Package version, stamped into the User-Agent on every request. Sourced from
// package.json so it tracks the published version automatically.
export const VERSION: string = pkg.version

export const USER_AGENT = `financy-cli/${VERSION}`
