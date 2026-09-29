<!-- Absolute raw URLs, not relative paths: npm does not resolve relative image
     paths when it renders this README on the package page. <picture> gives GitHub
     a theme-aware logo; npm strips <source> but keeps the <img>, so the light-mode
     logo is the fallback and reads correctly on npm's white page. -->
<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://raw.githubusercontent.com/open-finance-ai/financy/main/assets/logo-dark.png">
  <img
    src="https://raw.githubusercontent.com/open-finance-ai/financy/main/assets/logo-light.png"
    alt="Financy"
    width="240">
</picture>

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
2. **Subscribe to any paid plan** (Starter, Pro, or Ultra) — the data API is **not** available
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
`4` for an ineligible plan). Validation happens **before** anything is written —
a failed `setup` saves nothing and says so.

### Windows

The secret prompt echoes one `*` per accepted character, so you can see the value
arriving. If you paste and no `*`s appear, your console did not paste: the legacy
Windows console does not accept **Ctrl+V** at a prompt — use **right-click** or
**Ctrl+Shift+V**. A silently dropped paste used to be submitted as a mangled
secret and come back as a `401`.

The config file lives at `%USERPROFILE%\.config\financy\config.json`. Windows does
not enforce Unix file modes, so it is not restricted to your user the way it is on
macOS/Linux — treat it as readable by anything running as you.

If you hand-edit that file, note that PowerShell 5.1's `>` and `Out-File` write
UTF-16 and `Set-Content` writes a UTF-8 BOM. The CLI now reads all three, but
`financy config` is the way to check: it reports the file as `ok`, `missing`,
`malformed`, or `unreadable` rather than just showing blank credentials.

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

## Connect bit (digital wallet) and ask about it

bit can now be connected to Financy as a **digital wallet** (ארנק דיגיטלי). The
connection runs over regulated Open Banking and is **read-only**: Financy reads the
wallet account, its balance, and its transactions. It cannot send or request
payments, and there is no savings data.

### 1. Connect bit — from your phone

bit approves Open Banking consents **only inside its mobile app**, so start the
connection on the phone that has bit installed:

1. Open the Financy app at [financy.open-finance.ai](https://financy.open-finance.ai)
   in your phone's browser.
2. **Connect account** → the **ארנקים** (wallets) tab → **bit**.
3. Approve the consent in the bit app when it opens, then return to Financy.

Starting from a desktop browser will not work — the approval step has to land in
the bit app.

### 2. Ask about it from the CLI

bit is a connection like any bank or card, with provider id `bit`. There are no
wallet-specific commands; filter by its connection id:

```sh
financy connections list          # bit appears with PROVIDER "bit" — copy its ID
financy status                    # is the bit data current?
financy accounts list --connection <bit-connection-id>     # the wallet and its balance
financy transactions list --connection <bit-connection-id> --from 2026-09-01 --all
financy transactions list --connection <bit-connection-id> --from 2026-09-01 --all --json
```

Leave out `--connection` and you get every source at once — bit next to your banks
(e.g. Bank Hapoalim, provider `hapoalim`) and cards (e.g. Isracard, provider
`isracard`):

```sh
financy accounts list                                  # bit, bank, and card balances together
financy transactions list --from 2026-09-01 --all      # this month, every source
financy providers list                                 # resolve any PROVIDER value to its name
```

### 3. Ask about it from Claude or ChatGPT

Through the MCP server the same data is available as tools: `list_connections`
and `get_status` to find bit and check freshness, `list_accounts` and
`list_transactions` (both take a `connection` argument, and `list_transactions`
takes `from`/`to`) to read it, and `list_providers` to resolve provider ids.

- **Claude Code**, with the local server: `claude mcp add financy -- npx financy mcp`
  (see [MCP server](#mcp-server-for-ai-agents)).
- **Claude or ChatGPT**, with no CLI: add the hosted Financy connector,
  `https://mcp.open-finance.ai/mcp`, as a custom connector and sign in with your
  Financy account.

Then ask in plain language. The assistant pulls bit, bank, and card transactions
and combines them. Questions like "who hasn't paid yet" work by comparing this
period's incoming bit transfers with earlier ones — give the assistant the list of
who you expect to pay if you have one.

### Prompts for business owners

| Prompt | In English |
|---|---|
| «מי עוד לא שילם לי החודש?» | Who hasn't paid me yet this month? |
| «מי שילם לי פעמיים בטעות?» | Who paid me twice by mistake? |
| «כמה עשיתי היום?» | How much did I take in today? |
| «מי מהלקוחות הקבועים נעלם לי?» | Which regular customers have stopped paying? |
| «כמה כסף שוכב לי בביט ולא עבר לבנק?» | How much is sitting in bit and hasn't moved to the bank? |
| «איזה יום בשבוע הכי רווחי לי?» | Which day of the week brings in the most? |
| «כמה נכנס החודש מכל החשבונות — ביט והבנק ביחד?» | How much came in this month across all accounts — bit and the bank together? |
| «תן לי רשימה של כל מי ששילם לי בביט השבוע, עם סכום ותאריך» | List everyone who paid me on bit this week, with amount and date. |
| «מה התשלום הממוצע בביט החודש לעומת החודש שעבר?» | What's the average bit payment this month versus last month? |
| «תבנה לי דאשבורד שאני פותח כל בוקר: הכנסות מביט ומהבנק, הוצאות בישראכרט, ומי עוד לא שילם» | Build me a dashboard I open every morning: income from bit and the bank, Isracard spending, and who still hasn't paid. |

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
