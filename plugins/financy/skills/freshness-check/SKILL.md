---
name: freshness-check
description: >
  Decide whether the user's Financy banking data is current enough to answer
  with. Use before any answer that depends on recent balances or transactions
  ("what's my balance", "what did I spend this week", "did the card charge
  clear"), and whenever the user asks "is my data up to date", "why is this
  transaction missing", or "refresh my accounts". Reads get_status from the
  Financy connector and explains what to do when a connection is stale or
  broken.
---

# Freshness check

Answer one question first: *is this data current enough to use?* Then act on the
answer. Any analysis of balances or transactions should start here.

## 1. Read the status

Call `get_status`. It takes no arguments and returns one row per bank or card
connection, plus `staleThresholdDays`:

- `provider`: the bank or card issuer. It is `null` while a connection is still
  being set up.
- `status`: `ACTIVE` means the connection is healthy. Any other value means the
  connection is broken, which is a different problem from stale data.
- `fresh`: the date the data runs through, as `YYYY-MM-DD`. `null` means the
  connection has never fetched anything.
- `expires`: when the user's bank consent lapses. It says nothing about
  freshness, but mention it if it is within two weeks.
- `accounts`: how many accounts this connection covers.

Read `staleThresholdDays` from the response. Don't hard-code it.

If the call fails with an authorization error, the user needs to reconnect the
Financy connector. If it fails because the account is not on a paid plan, say
so and point the user to <https://open-finance.ai>. Don't retry in either case.

## 2. Classify each connection

| Condition | Meaning | What to tell the user |
|---|---|---|
| `status` is not `ACTIVE` | Broken connection | Reconnect this bank in the Financy app. Waiting will not fix it |
| `fresh` is `null` | Never fetched | The connection is new or stuck. If it's been more than a day, reconnect it |
| Days since `fresh` ≤ `staleThresholdDays` | Fresh | Go ahead |
| Days since `fresh` > `staleThresholdDays` | Stale | See step 3 |

Weigh this against what the user actually asked. Banks post with a lag, so data
one day old is normal and a gap over the weekend is expected.

- **How stale compared to the question.** "What did I spend last month" is fine
  on data that is three days old. "Did this morning's transfer land" is not.
- **Which connection is stale.** If only a card the question doesn't touch is
  behind, say so and carry on.

## 3. When data is stale

This connector is read-only. It cannot trigger a refresh. Tell the user that
they can refresh from the Financy app, and that it takes a few minutes. Then
either wait for them or go ahead with the stale data, whichever they prefer.

## 4. Report, then answer

Before the answer itself, give the as-of state in one line. For example:
*"Data is current through yesterday across all 3 banks"*, or *"Leumi is 4 days
behind. The card figures below are complete, but the checking account may be
missing a few days."*

Never present stale data as if it were current. When you go ahead with stale
data, give the as-of date in the answer.
