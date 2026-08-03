# PRD: financy CLI v1 (`financy` on npm)

Status: ready-for-agent
Source: the wayfinder map and the decision tickets behind each item below live in the
team's internal docs space — they reference internal services and are not part of this
public repo.

## Problem Statement

Financy users (paid starter/pro orgs) can only reach their aggregated Israeli banking data through the web app. Power users want it in the terminal; increasingly, their AI agents (Claude Code and friends) want it programmatically — and today there is no sanctioned, simple way for either. The raw API exists, but wiring it up (Auth0 client-credentials with a non-standard `userId`, pagination cursors, plan gates) is undocumented friction nobody should repeat per-user.

## Solution

A new-repo TypeScript CLI, `financy`, published as `financy` on public npm — installable as `npx financy`, configured once with the credentials users already have in Financy → Settings → API. It fronts the accounts-aggregation read surface (connections, accounts, transactions, reference data), adds a `status` freshness rollup and a `refresh` command riding service-chat's initiated refresh, and is AI-first by construction: stable `--json` envelope, granular exit codes, an embedded MCP server (`financy mcp`), and agent skills bundled in the same package (`financy skills install`).

## User Stories

1. As a Financy power user, I want to install the CLI with a single npx command, so that trying it costs nothing.
2. As a Financy user, I want `financy setup` to walk me through pasting the three values from Settings → API, so that configuration takes one minute.
3. As a Financy user, I want setup to validate my credentials immediately, so that I find out about typos now and not on my first real command.
4. As a free-plan user, I want setup to tell me clearly that the API needs starter/pro, so that I know upgrading is the fix and not my credentials.
5. As a user, I want `financy status` to tell me per bank whether my data is fresh, stale, or erroring, so that I can trust (or fix) what I'm about to analyze.
6. As a user, I want `financy refresh` to trigger an on-demand fetch of all my connections, so that I can pull today's data before a review — knowing it costs 20 credits.
7. As a user, I want `financy accounts list` to show my accounts with balances (₪, Hebrew names intact), so that I get an instant overview.
8. As a user, I want `financy transactions list --from --to --account --type` filters, so that I can slice transactions without exporting to a spreadsheet.
9. As a user, I want `financy connections list` with fetch state and consent expiry, so that I can see which bank consents need renewal.
10. As a power user, I want `--json` on every command with a stable envelope, so that I can pipe into jq and scripts that don't break on upgrades.
11. As a power user, I want `--all` auto-pagination and `--cursor` resumption, so that large transaction pulls are one command.
12. As an AI agent, I want documented exit codes distinguishing auth / plan / credits / not-found failures, so that I can branch without parsing prose.
13. As an AI agent, I want errors as structured JSON on stderr in `--json` mode, so that failure details are machine-readable.
14. As an AI agent driving via shell, I want credentials read from config or `FINANCY_*` env vars and never required in argv, so that secrets don't leak into history or process lists.
15. As an AI agent, I want an MCP server mode (`financy mcp`) with typed tools, so that MCP-native clients get the same data without shell plumbing.
16. As a Claude Code user, I want `financy skills install --all` to teach my agent Financy jobs, so that "review my spending" just works.
17. As an agent following the financy-setup skill, I want the exact onboarding steps (install → credentials → verify), so that I can onboard my user unattended.
18. As a business owner, I want the cashflow-runway skill to compute monthly net and months-of-runway, so that I know how long our cash lasts.
19. As a user, I want the recurring-charges skill to flag new or grown subscriptions, so that creep gets caught.
20. As a cardholder, I want the card-cycle-review skill to compare the upcoming card debit to my checking balance, so that I know the debit will clear.
21. As a salaried user or small business, I want the income-summary skill to show my income streams and their consistency, so that I can verify what came in.
22. As a user, I want `financy update` to update the CLI appropriately for how I installed it, so that staying current is one command.
23. As the maintainer, I want tag-triggered CI publishing with npm provenance, so that no laptop ever holds the publish token for a package that reads bank data.
24. As the maintainer, I want every request stamped `User-Agent: financy-cli/x.y.z`, so that version spread and command mix are measurable server-side without client telemetry.
25. As a user in a locale with Hebrew data, I want tables that align Hebrew text correctly, so that output stays readable.
26. As a security-conscious user, I want my secret stored in a 0600 config file and never echoed by any skill or command, so that local exposure is minimized.

## Implementation Decisions

Full detail lives in the linked tickets; this is the binding summary.

- **Repo & stack** (stack decision): new repo; TypeScript/Node (Node ≥20), commander; package and binary both named `financy`, public npm. No standalone binary in v1.
- **Command surface** (command surface): `setup`, `status`, `refresh`, `update`, `connections list|get`, `accounts list|get`, `transactions list|get`, `categories`, `providers list|branches`. Read-only apart from `refresh`. No payments/merchants, no deletes, no balance history.
- **Auth** (auth design, API research): Auth0 client-credentials grant with `userId` in the token body; no refresh token — cache token beside config, re-mint on `exp`/401. Config at `~/.config/financy/config.json` (0600), shaped `{profiles: {default}}`; `FINANCY_CLIENT_ID/SECRET/USER_ID` env vars override; headless setup via `--no-input` from env only. Setup validates (mint + one read); free-plan 403 saves creds but exits with the dedicated plan exit code.
- **Interface contract** (interface prototype, assets in `prototype/`): human tables default, `--json` → `{data, count, nextPage}`; errors `{error:{code,message,…}}` on stderr; exit codes 0 ok / 1 unexpected / 2 usage / 3 auth / 4 plan / 5 credits / 6 not-found / 7 api-unavailable; flags `--from --to --account --connection --type --limit --all --cursor`; table padding by display width (Hebrew).
- **Refresh** (command surface): calls service-chat `POST /chat/connections/refresh` (20 credits, org-wide; accepted/already_running → exit 0, poll via `status`). **Backend prerequisite:** paid Financy org client-grants must gain the route's `create:ai-chat-message` scope — a dashboard grant-sync change; the only backend work in v1.
- **MCP** (MCP design): `financy mcp` stdio server, official TS SDK, config inherited from CLI; tools 1:1 verb_noun (`list_transactions`, `get_status`, …) with descriptions-as-spec; same envelope and default limit as the CLI; `refresh_connections` exposed with the 20-credit warning in its description.
- **Skills** (skills decision, revised 2026-08-03): ship **inside this package** under `skills/`, installed with `financy skills install`; the separate `@open-finance/skills` package is deprecated in favour of one channel. They drive the CLI via Bash `--json` + exit codes (MCP mentioned as alternative). v1 ships `financy-setup` and `freshness-check`; the five analysis skills (spending-review, cashflow-runway, recurring-charges, card-cycle-review, income-summary) follow in a later release. Guardrails: never echo secrets, confirm credit-costing actions, exit 4 → upgrade path.
- **Release** (release machinery): GH Actions publish on version tag with `--provenance`; plain semver + tags, hand CHANGELOG; `financy update` is install-mode-aware; `engines` + runtime Node check; no server-driven update signal.
- **Telemetry & docs** (resolved in this ticket): no client telemetry — server-side User-Agent measurement only. Docs: repo README (full reference) + a page on docs-financy.open-finance.ai (install, credentials, links); Financy → Settings → API links to it.

## Testing Decisions

- Good tests hit external behavior only: run a command (args + env) against a **mocked HTTP layer with recorded API fixtures**, assert stdout (JSON envelope / table), stderr, and exit code. No testing of internals.
- **MCP tools tested at the tool-call boundary** with the same fixture set (both modes share handlers).
- **Auth flow against a fake token endpoint**: mint, cache, expiry re-mint, 401-retry, plan-403 mapping to exit 4.
- No live-API tests in CI; a small manual smoke script runs pre-release.
- Prior art: none in this repo (new); the fixture-driven style mirrors service-chat's tests-with-mock-data convention rather than the untested sibling repos.

## Out of Scope

- Financy agent surfaces: chat, briefings, budgets/alerts, memories, corrections.
- Payments & merchants commands, connection create/delete, balance history.
- OAuth / device-flow auth (future; v1 is credentials-based).
- Client telemetry, standalone binaries, multi-profile UX (config is future-proofed for profiles).

## Further Notes

- The CLI is **paid-plan-only by construction** — the API's `financyAccess` gate blocks free orgs on every data route; the CLI's job is to fail that case clearly, not to work around it.
- The runnable interface prototype (`prototype/financy-proto.mjs` + `TRANSCRIPT.md`) is the concrete reference for output, copy, and exit codes — locked by Barak as-is.
- Optional brand protection: unscoped `financy` / `financy-cli` npm names were free at decision time and may be claimed as alias packages.
