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
financy integrations list|get <id>   Connected business systems (invoicing: Invoice4U, Morning, SUMIT, iCount; ERP: Priority, Rivhit; clearing: Isracard Business)
financy receivables                  Who owes you what: open and overdue invoices, aged per customer
financy documents list|get           Invoices, receipts and credit notes in a business system
financy customers list|get           Customers in a business system
financy settlements list             Card payouts from a clearing integration (Isracard Business)
financy payables <id>                What you owe suppliers, aged per supplier (ERP)
financy suppliers list               Suppliers in an ERP (Priority, Rivhit)
financy bills list                   Supplier invoices and credits in an ERP
financy ledger list                  General ledger balances by account and month (ERP)
financy orders list                  Sales and purchase orders in an ERP
financy inventory list               Stock on hand and its value at cost (ERP)
financy proposals list|get|create    Document drafts — issued only after you approve them in Financy
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

## Invoices (Invoice4U, Morning, SUMIT, iCount)

Connect your invoicing system to Financy and the CLI reads it next to your bank
data: who owes you what, every invoice and receipt, your customers — and it can
**draft** documents for you to approve. Supported systems are **Invoice4U**,
**Morning** (formerly Green Invoice), **SUMIT** and **iCount**, and drafts work
with all four. Invoicing needs a
paid plan (Starter and above), and a free account gets exit `4` with the code
`UPGRADE_REQUIRED`.

Connect your system in the Financy app, under **Connections → Business systems**;
the CLI reads connections, it does not create them. Then:

```sh
financy integrations list                     # copy the integration ID (intg_…)
financy receivables                           # open and overdue totals, per customer
financy receivables --detailed --json         # …with each customer's open invoices
financy documents list <integrationId> --status open --from 2026-09-01
financy documents list <integrationId> --receivable-only --all --json
financy documents get <integrationId> <documentId>
financy customers list <integrationId> --search "סטודיו"
```

```
$ financy receivables
Receivables as of 2026-10-11
  ILS: ₪2,340.00 open, ₪2,340.00 overdue across 1 documents

CUSTOMER   OPEN       OVERDUE    DOCS  MAX DAYS LATE  CUSTOMER ID
סטודיו גל  ₪2,340.00  ₪2,340.00  1     10             icus_…
```

Tables show amounts in shekels; under `--json` every amount is an integer in minor
units (`…Minor`, agorot for ILS) exactly as the API returns it, and record lists
carry a `freshness` object saying how recent the synced data is. Record lists page
with `--limit`, `--cursor` and `--all`; `proposals list` takes only `--limit` (max 50).

### Card payouts (Isracard Business)

If the business clears cards with Isracard, connect **Isracard Business** in the
Financy app (Pro and above). It is a **clearing** integration: no invoices, just
the payouts Isracard makes to the business — `expected` (a future credit, not yet in
the bank) and `settled` (already paid into the account ending in `TO ACCOUNT`, so
already part of that account's balance and transactions; never add it on top).

```sh
financy integrations list                         # the clearing one has CATEGORY clearing
financy settlements list <integrationId> --status expected
financy settlements list <integrationId> --from 2026-10-01 --to 2026-10-31 --all --json
```

The table shows gross and net (after commission, VAT and fees) in shekels, latest
payment date first; `--json` keeps every deduction in minor units.

### ERP (Priority, Rivhit)

An ERP connected in the Financy app (Pro and above) is an integration with the
category **erp**. It is **read only**: the CLI never drafts or issues anything in an
ERP. Beside its sales documents and customers (`documents`, `customers`), it reads
what an ERP holds beyond invoicing: suppliers, bills (what you owe suppliers), the
general ledger by month, sales and purchase orders, and inventory. **Priority**
(Priority Cloud) and **Rivhit** are supported; these streams are in **beta**. Rivhit's
ledger holds profit-and-loss accounts only, so it has no balance sheet.

```sh
financy integrations list                         # the ERP one has CATEGORY erp
financy payables <integrationId>                  # open bills aged per supplier
financy payables <integrationId> --detailed --json
financy suppliers list <integrationId> --search "Ltd"
financy bills list <integrationId> --open-only --from 2026-09-01
financy ledger list <integrationId> --from 2026-01 --to 2026-09 --kind income --all --json
financy orders list <integrationId> --side purchase --status open
financy inventory list <integrationId> --in-stock-only
```

Bills and orders show newest first and the ledger shows the latest month first;
`--json` keeps the API order. Payables are what you owe; never net them against
`financy receivables`.

### Drafting a document

`financy proposals create` sends a draft request and creates a **draft** — nothing
is issued. The document is created in your invoicing system (Invoice4U, Morning,
SUMIT or iCount) only after you open the returned approval link and approve it in Financy:

```sh
cat > draft.json <<'JSON'
{
  "action": "create_tax_invoice",
  "items": [{
    "counterpartyId": "icus_…",
    "lines": [{ "description": "עיצוב לוגו", "quantity": 1, "unitPriceMinor": 234000 }],
    "pricesIncludeVat": true
  }]
}
JSON
financy proposals create <integrationId> --file draft.json
financy proposals get <proposalId>            # status: pending_approval → completed
```

`action` is one of `create_tax_invoice`, `create_invoice_receipt`, `create_receipt`,
`create_credit_note` or `create_customer`. Each request carries an `Idempotency-Key`
(a fresh UUID unless you pass `--idempotency-key`), so retrying with the same key
returns the first draft instead of a second one. The CLI cannot approve or cancel a
draft — that is always your step in Financy.

Integration errors keep the API's code (`UPGRADE_REQUIRED`, `NOT_FOUND`,
`VALIDATION_FAILED`, `PROPOSAL_INVALID`, `RATE_LIMITED`, …) and exit by class: `4`
plan or permission, `6` not found, `2` invalid request, `1` conflict or expired
cursor, `7` rate-limited or unavailable. Under `--json` the error also carries
`retryable`, `userActionRequired` and, where the API gives one, an `action`.
`INSUFFICIENT_SCOPE` means the token predates the key's integration access: the CLI
mints a fresh one and retries once, and if that is refused too, the key has no
integration access: a key set to read-only ("מידע בלבד" in Financy → Settings → API access)
cannot reach integrations or payments, so turn that off; otherwise check the plan is
Starter or above and rotate the key there.
The integrations API lives at `https://api.open-finance.ai/integrations`; override it
with `FINANCY_INTEGRATIONS_URL` (it otherwise follows `FINANCY_API_URL`'s host).

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

The local server also serves the invoicing tools — `list_integrations`,
`get_integration`, `get_receivables`, `list_invoicing_documents`,
`get_invoicing_document`, `list_invoicing_customers`, `get_invoicing_customer`,
`list_clearing_settlements`, the read-only ERP tools `get_payables`, `list_suppliers`,
`list_bills`, `list_ledger_balances`, `list_orders` and `list_inventory`,
`list_proposals`, `get_proposal`, and the draft tools `draft_invoice`,
`draft_invoice_receipt`, `draft_receipt` and `draft_credit_note`. A draft tool only
creates a draft: its description tells the agent to show the user the approval link,
and nothing is issued until the user approves it in Financy. These tools are not in
the importable `TOOLS` table, because hosts that import it (such as the hosted
Financy connector) serve their own invoicing tools under the same names.

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
