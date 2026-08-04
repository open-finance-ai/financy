# financy

Your Open-Finance / Financy banking data — connections, accounts, balances,
transactions — in the terminal, with machine-first output for scripting, an
embedded MCP server for agents, and agent skills in the box.

```sh
npx financy status
```

## Install

```sh
npm install -g financy     # or just use npx financy <command>
```

Node 20+ is the only prerequisite.

## Requirements

The CLI talks to your Open-Finance data through the Financy API, which is a **paid
feature**. To use it you must:

1. **Register for a Financy account** at [open-finance.ai](https://open-finance.ai).
2. **Subscribe to a paid plan** (Starter or Pro) — the data API is **not** available
   on the free plan (every data command returns exit code `4`).
3. Copy your `clientId`, `clientSecret`, and `userId` from the Financy app →
   **Settings → API**.

## Setup

```sh
financy setup                 # interactive prompts (explains where to get the values)
financy setup --no-input      # read FINANCY_CLIENT_ID / _SECRET / _USER_ID from env (agents/CI)
```

`setup` validates the credentials against the live API before saving, so an
unregistered/free account is caught immediately (exit `3` for bad credentials,
`4` for an ineligible plan).

## Commands

```
financy status                       Are my connections fresh? one-line-per-bank rollup
financy connections list|get <id>    Bank/card connections and their fetch state
financy accounts list|get <id>       Accounts with balances (securities embedded)
financy transactions list|get <id>   Transactions with --from/--to/--account/--type filters
financy categories                   The category taxonomy (English + Hebrew)
financy providers list|branches      Reference data: banks and branches
financy refresh                      Trigger an on-demand refresh of all connections (20 credits)
financy config                       Show resolved endpoints + credential sources (secret masked)
financy skills list|install          Agent skills bundled with the CLI
financy mcp                          Run the embedded MCP server (stdio)
```

Debugging tip: `financy config` shows which endpoints and credentials are in effect
(and whether each came from env or the config file) without ever printing the secret.
Set `FINANCY_DEBUG=1` to have the raw API response bodies printed to stderr.

Every command takes `--json` for a stable machine-readable envelope
(`{data, count, nextPage}` for lists, `{data}` for single resources; errors as
`{error:{code,message}}` on stderr). List commands take `--limit`, `--cursor`, and
`--all` (auto-paginate). Exit codes: `0` ok · `1` unexpected · `2` usage · `3` auth
· `4` plan · `5` credits · `6` not-found · `7` api.

## Agent skills

Skills ship inside this package, so they can never drift from the CLI version they
drive. Install them into a project's `.claude/skills/` directory:

```sh
financy skills list             # what's in the box
financy skills install --all    # install every skill here
financy skills install freshness-check --dir ~/work/analysis
```

| Skill | What it teaches an agent |
|---|---|
| `financy-setup` | Onboarding a user end to end: install, find the credentials, save them without ever echoing the secret, verify, and explain the paid-plan requirement on exit `4`. |
| `freshness-check` | Reading `financy status --json`, deciding whether the data is current enough to answer with, and confirming the 20-credit cost before triggering a refresh. |

Skills are plain `SKILL.md` files — read them under [`skills/`](skills/) before you
install them.

## MCP server (for AI agents)

`financy mcp` runs a stdio [Model Context Protocol](https://modelcontextprotocol.io)
server exposing the command surface 1:1 as `verb_noun` tools (`list_connections`,
`get_status`, `refresh_connections`, …) with the same `{data, …}` envelopes. Add it
to Claude Code:

```sh
claude mcp add financy -- npx financy mcp
```

Credentials resolve exactly as the CLI does (config file or `FINANCY_*` env vars);
an unconfigured server returns a structured `NOT_CONFIGURED` error from every tool.
`refresh_connections` costs 20 credits — its tool description tells agents to
confirm with the user first.

## Updating

```sh
financy update
```

Detects how it was installed and does the right thing: a global install runs
`npm install -g financy@latest`; under `npx` it reminds you that npx always
runs the latest; as a project dependency it defers to your project's package manager.

## Releasing

1. Update `CHANGELOG.md` (move items out of _Unreleased_ into the new version).
2. `npm version <patch|minor|major>` — bumps `package.json` and creates a `vX.Y.Z` tag.
3. `git push --follow-tags`.
4. The **Release** workflow (`.github/workflows/release.yml`) runs on the tag: it
   re-runs lint/typecheck/test/build, verifies the tag matches `package.json`, and
   publishes to npm with `--provenance` (via the `NPM_TOKEN` secret and `id-token`
   trusted publishing). The published version shows its provenance attestation on npm.

Before tagging, run the manual staging smoke test (not part of CI) with a real
paid-org credential:

```sh
npm run build
FINANCY_CLIENT_ID=… FINANCY_CLIENT_SECRET=… FINANCY_USER_ID=… \
FINANCY_AUTH_URL=… FINANCY_API_URL=… FINANCY_CHAT_URL=… FINANCY_AUDIENCE=… \
npm run smoke
```

## License

[Apache-2.0](LICENSE)
