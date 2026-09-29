---
name: balances-overview
description: >
  Summarise the user's current financial position from Financy: balances
  across checking accounts, credit cards, savings, loans and securities, and
  the net total. Use when the user asks "what's my balance", "how much money do
  I have", "show all my accounts", "what do I owe on my cards", "what's my net
  worth", "כמה כסף יש לי", or wants a snapshot of their accounts across banks.
---

# Balances overview

## 1. Check freshness

Call `get_status` first. A balance is only as current as its connection's
`fresh` date. Show that date next to each bank rather than presenting every
balance as "now". See the `freshness-check` skill for how to handle stale or
broken connections.

## 2. Fetch the accounts

Call `list_accounts` with `all: true`. To look at a single kind of account,
filter with `type`: `CHECKING`, `CARD`, `LOAN`, `SAVINGS` or `SECURITY`. The
securities held in an investment account are embedded in that account.

To map a `providerId` to a bank name, call `list_providers` once.

## 3. Read the balance

Each account has a `balances` array. Use the entry with `balanceType:
"closingBooked"`. If there isn't one, use the first entry. The amount is in
`balanceAmount.amount` and its currency in `balanceAmount.currency`.

Balance types mean different things for different account types. For example,
a card's balance is usually the amount charged but not yet billed. Label each
figure with what it is rather than calling everything "balance".

## 4. Build the summary

Group by account type, then by bank:

- **Cash:** checking and savings accounts.
- **Investments:** securities accounts.
- **Owed:** card charges not yet billed, and loan balances. Show these as
  amounts owed, not as negative assets.
- **Net position:** cash plus investments, minus what's owed. Only show it if
  every connection is healthy and reasonably fresh. Otherwise list which
  connections are missing and give partial totals.

Mask account numbers. Show only the last four digits, even though the data
contains the full number.

## 5. Keep it descriptive

Report what the accounts show. Don't recommend moving money, paying down
specific debts or picking investments. This connector is read-only, so it
can't take action on the user's accounts in any case.
