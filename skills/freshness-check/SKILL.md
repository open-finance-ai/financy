---
name: freshness-check
description: >
  Decide whether the user's Open-Finance banking data is current enough to
  answer with, and offer a refresh when it is not. Use before any analysis that
  depends on recent transactions or balances ("what did I spend this week",
  "what is my balance", "did the card charge clear"), and whenever the user asks
  "is my data up to date", "why is this missing", "refresh my accounts", or a
  recent transaction they expect is absent. Interprets financy status --json,
  applies the staleness threshold, and confirms the 20-credit cost with the user
  before ever triggering financy refresh.
---

# freshness check

Answer one question — *is this data current enough to use?* — and act on the
answer. Every analysis skill that reads financy data should start here.

**Minimum CLI version:** 0.1.0

## Guardrails

- **Confirm before spending credits.** `financy refresh` costs **20 credits**
  every time it is called. Never run it without stating the cost and getting an
  explicit yes from the user in this conversation. "The data is stale, want me
  to refresh?" is not enough — say the number.
- **Never echo the client secret** or the contents of the config file. If you
  need to show what is configured, use `financy config`, which masks the secret.
- **Exit code 4 means the plan, not the credentials.** Point the user at the
  upgrade path at <https://open-finance.ai> and stop; do not retry and do not
  ask for new credentials.

## Method

### 1. Read the status

```bash
financy status --json
```

The envelope:

```json
{
  "data": [
    {
      "provider": "hapoalim",
      "status": "ACTIVE",
      "fresh": "2026-08-01",
      "expires": "2026-11-14",
      "accounts": 3
    }
  ],
  "staleThresholdDays": 2
}
```

Per row:

- `provider` — the bank or card issuer. `null` while a connection is still
  being established.
- `status` — `ACTIVE` means the connection itself is healthy. Anything else is
  a broken connection, not a staleness problem.
- `fresh` — the date the data runs through, as `YYYY-MM-DD`. `null` means the
  connection has never fetched anything.
- `expires` — when the user's bank consent lapses. Not a freshness signal, but
  worth surfacing when it is close.
- `accounts` — how many accounts, cards, savings, loans and securities this
  connection covers.

`staleThresholdDays` is the CLI's own threshold (2 days). Read it from the
response rather than hard-coding it.

Handle the exit code before the body: `3` → the CLI is not configured or the
credentials are rejected, so run the `financy-setup` skill instead; `4` → see
the guardrail above; `7` → the API is unreachable, retry once then report.

### 2. Classify each connection

Compare `fresh` to today, in whole calendar days:

| Condition | Meaning | What to do |
|---|---|---|
| `status` is not `ACTIVE` | The connection is broken | A refresh will not fix it — the user must reconnect the bank in the Financy app |
| `fresh` is `null` | Never fetched | A refresh is worth offering; if it has been pending a long time, reconnecting is more likely to help |
| days since `fresh` ≤ `staleThresholdDays` | Fresh | Proceed with the analysis |
| days since `fresh` > `staleThresholdDays` | Stale | Offer a refresh (step 3) |

Weigh this against what the user actually asked. Banks post transactions with a
lag, so a one-day-old feed is normal and a weekend gap is expected. Two facts
matter more than the raw number:

- **How stale relative to the question.** "What did I spend last month" is fine
  on three-day-old data. "Did this morning's transfer land" is not.
- **Which connection is stale.** If only an unrelated card is behind, say so and
  carry on rather than refreshing everything.

### 3. Offer the refresh

When a refresh would genuinely help, ask — with the cost stated:

> Your Hapoalim data runs through 2026-07-28, which is 6 days old. I can trigger
> a refresh, which costs **20 credits** and takes a few minutes. Want me to?

Only after an explicit yes:

```bash
financy refresh --json
```

Notes on the behaviour:

- Refresh is **org-wide** — it refreshes every connection, not the one you named.
  Say that when you ask, so 20 credits does not read as a per-bank price.
- `{"data":{"status":"already_running"}}` means a refresh was already in flight.
  No new charge; just wait.
- It is asynchronous. Data lands in a few minutes; `financy refresh` returning
  does not mean the data is there. Poll `financy status --json` and watch `fresh`
  advance.
- Exit `5` (`INSUFFICIENT_CREDITS`) — the account is out of credits. Tell the
  user and stop.

### 4. Report and proceed

Say what you found before you answer the actual question, in one line — for
example *"Data is current through yesterday across all 3 banks"* or *"Leumi is
4 days behind; the rest are current, so the card analysis below is complete but
the checking-account view may be missing a few days."*

If the user declines the refresh, proceed with the stale data and state the
as-of date in your answer. Do not silently analyse stale data as if it were
current.

## MCP alternative

Against the financy MCP server the same flow is `get_status` followed, only
after confirmation, by `refresh_connections`. The envelopes are identical to the
CLI's `--json` output. `refresh_connections` carries the 20-credit warning in its
tool description — treat that as binding, not advisory.
