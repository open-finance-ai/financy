---
name: spending-analysis
description: >
  Analyse the user's spending from their Financy bank and credit-card
  transactions: totals for a period, breakdowns by category or merchant,
  month-over-month comparisons, recurring charges and unusual expenses. Use
  whenever the user asks "how much did I spend", "where does my money go",
  "what are my biggest expenses", "compare this month to last month", "what
  subscriptions do I have", "כמה הוצאתי החודש", or anything that means adding
  up transactions. Covers the traps that make totals wrong: counting a
  credit-card bill twice, sign conventions, duplicates and pagination.
---

# Spending analysis

Adding up transactions looks simple, but a naive sum of Israeli bank and card
data is almost always wrong. Follow these steps in order.

## 1. Check freshness first

Run the `freshness-check` skill, or call `get_status` directly, before you
total anything. A period that ends after a connection's `fresh` date is
incomplete. Say so rather than reporting a low total.

## 2. Fetch one bounded window at a time

Call `list_transactions` with `from` and `to` (`YYYY-MM-DD`). Always pass a
date range. Work one month at a time for anything longer than a month.

- Results come 50 at a time. Follow `nextPage` by passing it as `cursor` until
  it is `null`. A busy month is several pages, and a total built from the first
  page alone is wrong.
- Avoid `all: true`. A busy month can exceed the result size and come back as
  `RESULT_TOO_LARGE`. If that happens, page with `cursor` instead, or split
  the window by half-month or by `type`. Don't drop the filters.
- `type: "CARD"` returns only card transactions, and `type: "BANK"` only
  bank-account transactions.

## 3. Read each transaction correctly

- **Amount:** use `amount.chargedAmount.amount`. If it's missing, fall back to
  `amount.originalAmount.amount`.
  - Negative is money out. Positive is money in (salary, refunds, transfers in).
  - The currency is in `.currency`, and is usually `ILS`. A foreign-currency
    purchase keeps its original currency in `originalAmount`. Total in the
    charged currency.
- **Date:** use `date.transactionDate` for "when did I spend it". A card
  purchase is often billed in the following month.
- **Name:** use `merchantName`, falling back to `description.description`.
  Merchant names are often in Hebrew. Keep them as they are and don't
  transliterate.
- **Category:** use `category.main` / `category.sub`. Call `list_categories` once
  to map these codes to readable English or Hebrew labels.
- **Duplicates:** skip any transaction with `isDuplicate: true`.

## 4. Don't count card bills twice

This is the biggest source of wrong totals. Each card purchase appears as its
own `CARD` transaction. Then, once a month, the **whole card bill** is debited
from the bank account as a single `BANK` transaction. That transaction has
`category.sub` set to `CREDIT_CARD_EXPENSES` (under `category.main: FINANCE`) and
`classification.source` set to `CREDIT_CARD`.

Pick one view and say which one you used:

- **Spending by category or merchant (the default):** use the `CARD` purchases
  plus `BANK` expenses, but **exclude** the bank's card-bill debits.
- **Cash flow out of the bank account:** use `BANK` transactions only,
  including the card-bill debits, and no `CARD` rows.

If a card that gets billed to the bank account isn't connected, its bill is
the only record of that spending. In that case keep the bill and note that it
can't be broken down by category.

## 5. Exclude what isn't spending

Leave these out of spending totals and mention them separately if relevant:

- transfers between the user's own accounts
- deposits into savings
- loan principal movements
- incoming money (positive amounts)

Use the category and the `classification.type` (`REGULAR_EXPENSE`,
`VARIABLE_EXPENSE`, and so on) to tell fixed costs from discretionary spending.

## 6. Present it

- State the period, which accounts are included, and the as-of date.
- Round to whole shekels (₪) in summaries. Keep exact amounts in any table of
  individual transactions.
- For comparisons, show both periods and the difference. Only flag a change as
  meaningful if it is large relative to the category's usual size.
- Describe what the data shows. Don't give investment or credit advice, and
  don't recommend specific financial products.
