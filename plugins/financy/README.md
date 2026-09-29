# Financy for Claude

Ask Claude about your Israeli bank and credit-card accounts, balances and
transactions. The plugin connects Claude to Financy's hosted connector, and adds
skills that tell Claude how to read the data correctly.

## What it does

- **Connector:** `https://mcp.open-finance.ai/mcp`, a read-only MCP server. It
  can list your connections, accounts, balances and transactions. It cannot
  move money, change anything in your accounts, or trigger a refresh.
- **Skills:**
  - `freshness-check`: checks how current each bank's data is before Claude
    answers from it.
  - `spending-analysis`: totals and breakdowns that don't count a credit-card
    bill twice (once as card purchases and again as the bank debit).
  - `balances-overview`: a snapshot across checking accounts, cards, savings,
    loans and securities.

## Before you start

You need a Financy account at <https://open-finance.ai> on a paid plan, with at
least one bank or card connected. The first time Claude uses the connector, it
asks you to sign in to Financy. Claude never sees your password.

## Try it

- "How much did I spend on restaurants last month?"
- "Compare my spending in August and September by category."
- "What are my account balances across all my banks?"
- "Is my bank data up to date?"

## Data and privacy

When you ask a question, Claude calls the connector with your signed-in Financy
session. The connector reads your data from the Financy API and returns it to
Claude.

- National ID numbers and internal identifiers are removed before anything is
  returned.
- The plugin sends nothing anywhere else.

See the privacy policy at <https://open-finance.ai/privacy-policy>. For support, write
to support@open-finance.ai.
