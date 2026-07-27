# Skills: the five analysis skills

Status: ready-for-agent (AFK)

## Parent

PRD: `../PRD.md` (financy CLI v1)

## What to build

The five analysis skills in `open-finance-ai/agent-skills` → `@open-finance/skills`, each a SKILL.md teaching a job-to-be-done via `financy … --json`: **spending-review** (period spending by category, month-over-month deltas, notable merchants), **cashflow-runway** (monthly net in/out from transactions + checking balances → months-of-runway), **recurring-charges** (subscription-like patterns by merchant/amount/cadence; flag new or grown), **card-cycle-review** (per-card cycle charges, cardDueDate, interim balance vs checking — "will the debit clear?"), **income-summary** (income streams from credits, monthly totals, consistency). Business-first framing (paying users are mostly businesses); Hebrew merchant names handled naturally. Each skill starts by checking data freshness (deferring to freshness-check's guidance) and states its minimum CLI version. Standing guardrails apply.

## Acceptance criteria

- [ ] Five SKILL.md files with manifest entries, template-conformant
- [ ] Each skill's method section names the exact commands/filters it uses and defines its output (what the agent should present, in what structure)
- [ ] Recurring/cycle logic guidance is date-window-aware (charge dates vs transaction dates called out for cards)
- [ ] Dry-run: at least two of the five completed unassisted by a Claude Code session against staging or fixtures
- [ ] Guardrails present in all five

## Blocked by

- 03-full-read-surface
