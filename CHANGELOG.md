# Changelog

All notable changes to `financy` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-08-18

Transaction lookups were keyed by the wrong field, and the package became
importable so an out-of-process host can serve the same MCP tools.

### Added

- **The package is now importable**, not just a `bin`. `import { TOOLS, callTool,
  bearerConfig, VERSION } from 'financy'` exposes the tool table, the dispatcher, a
  config built from a caller's bearer token, and the version — exactly what a remote
  MCP host needs to serve the same tools this CLI serves. Everything else stays
  internal so it can change without a breaking release. Type declarations ship too.

### Fixed

- **`transactions get` rejected the only identifier the CLI showed you.** A
  transaction's `id` is a bare ULID, but the route is keyed by the composite sort key
  the API returns as `SK`. `transactions list` printed the `id`, so pasting it into
  `transactions get` always failed with `TRANSACTION_NOT_FOUND` — which reads as a
  permissions problem rather than the wrong field. The list now prints the `SK`, the
  way the accounts and connections tables print the value their `get` accepts, and a
  bare `id` fails as `INVALID_ARGUMENT` naming the field to use instead.
- **The `get_transaction` MCP tool advertised the wrong argument.** Its schema
  described `id` as "the transaction id", so an agent reading `.id` off
  `list_transactions` could never resolve a transaction. Both the tool description and
  the argument now name `SK`, and `list_transactions` says which field to carry over.

## [0.1.3] — 2026-08-11

The Windows release: `setup` could not reliably collect a client secret there,
and every failure mode around it was invisible.

### Fixed

- **Windows: `setup` could submit a mangled secret and fail with `401`.** The masked
  prompt relied on readline's internal write path with `terminal: true`, which behaves
  differently across Windows consoles, and echoed nothing at all — so a Ctrl+V that
  the legacy console never turned into a paste was submitted as a bare control byte
  with no visible sign. The prompt now reads raw keystrokes itself, echoes one `*` per
  accepted character, drops control bytes and escape sequences, and points at
  right-click / Ctrl+Shift+V when it sees a keystroke that entered no text.
- Credentials from every source (prompt, env, config file) are normalized: control
  characters stripped, whitespace trimmed, and one layer of wrapping quotes removed —
  so `set X="v"` and a trailing space copied with the line no longer cause a `401`.
- A failed `setup` now says explicitly that **nothing was saved**, instead of leaving
  users believing their credentials were stored.
- The config file is read even when written as UTF-16 or with a UTF-8 BOM (what
  PowerShell's `>`, `Out-File`, and `Set-Content` produce), and a file that cannot be
  used is reported as `malformed`/`unreadable` instead of silently showing every
  credential as unset.
- `setup` no longer claims `permissions 600` on Windows, where file modes are not
  enforced.

### Added

- `financy config` reports the config file's state (`ok` / `missing` / `malformed` /
  `unreadable`) and the client secret's length — enough to spot a truncated paste
  without printing the secret.
- CI runs on `windows-latest` as well as Ubuntu, and on Node 24 alongside 20 and 22.

## [0.1.2] — 2026-08-05

No change to the command surface. Dependency updates and packaging.

### Changed

- Updated `@modelcontextprotocol/sdk` and its `hono` / `@hono/node-server` /
  `ip-address` transitive dependencies, clearing the runtime-scope advisories.
  The remaining advisories are development-only (`vitest`, `vite`, `esbuild`),
  also updated here — they are not part of the published package.
- The README now carries the Financy logo, so it appears on both the repository
  front page and the npm package page.

### Removed

- The internal planning documents (`docs/plan`) that shipped with the repository.
  They described intended rather than actual behaviour; the README is the
  reference. They were never part of the published package.

## [0.1.1] — 2026-08-04

No functional change. This is the first version published through CI with a
verifiable build.

### Changed

- Published from GitHub Actions via npm **trusted publishing** (OIDC), so the
  tarball carries a provenance attestation tying it to this repository, this
  workflow file, and the commit it was built from. No npm token exists in the
  repository or in any secret.
- `0.1.0` was published manually to bootstrap the package name — npm cannot
  configure a trusted publisher for a package that does not exist yet
  ([npm/cli#8544](https://github.com/npm/cli/issues/8544)) — and therefore has
  **no** attestation. Prefer `0.1.1` or later.

## [0.1.0] — 2026-08-03

First public release of the `financy` CLI (v1).

### Added

- `financy status` — per-connection freshness rollup (human table + `--json`
  `{data, staleThresholdDays}`), with a refresh nudge when a connection needs attention.
- `financy setup` — save API credentials interactively or from `FINANCY_*` env vars
  (`--no-input`), stored with owner-only permissions; validates against the live token
  mint + a read.
- Read surface: `connections`, `accounts`, `transactions` (`list`/`get`), `categories`,
  `providers list|branches` — with `--limit`, `--cursor`, `--all`, and resource filters.
- `financy refresh` — org-wide on-demand refresh via service-chat (20 credits);
  maps insufficient-credits (exit 5) and no-refreshable-connections (exit 1).
- `financy mcp` — stdio MCP server exposing the command surface 1:1 as eleven
  `verb_noun` tools with the same `{data, …}` envelopes.
- `financy skills list|install` — agent skills ship inside this package and install
  into a project's `.claude/skills/`. v1 bundles `financy-setup` (onboarding) and
  `freshness-check` (staleness triage and the 20-credit refresh decision).
- `financy update` — install-mode-aware self-update (global / npx / local dependency).
- Stable machine-first contract: `--json` envelopes, granular exit codes (0–7), and a
  Node 20+ runtime floor.

### Notes

- The package is published as **`financy`** on public npm. It was built under the
  working name `@open-finance/cli`, which was never published.
- The agent skills originally planned for the separate `@open-finance/skills` package
  ship here instead, so a skill can never drift from the CLI version it drives.
  `@open-finance/skills` is deprecated.

[Unreleased]: https://github.com/open-finance-ai/financy/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/open-finance-ai/financy/releases/tag/v0.2.0
[0.1.3]: https://github.com/open-finance-ai/financy/releases/tag/v0.1.3
[0.1.2]: https://github.com/open-finance-ai/financy/releases/tag/v0.1.2
[0.1.1]: https://github.com/open-finance-ai/financy/releases/tag/v0.1.1
[0.1.0]: https://github.com/open-finance-ai/financy/releases/tag/v0.1.0
