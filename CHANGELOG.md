# Changelog

All notable changes to `@open-finance/cli` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-07-24

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
- `financy update` — install-mode-aware self-update (global / npx / local dependency).
- Stable machine-first contract: `--json` envelopes, granular exit codes (0–7), and a
  Node 20+ runtime floor.

[Unreleased]: https://github.com/open-finance-ai/financy/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/open-finance-ai/financy/releases/tag/v0.1.0
