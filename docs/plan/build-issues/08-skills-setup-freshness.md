# Skills: financy-setup + freshness-check

Status: ready-for-agent (AFK)

## Parent

PRD: `../PRD.md` (financy CLI v1)

## What to build

The first two agent skills, authored in the existing `open-finance-ai/agent-skills` repo (joining `bank-account-analysis`) for publication in `@open-finance/skills` — install path `npx skills add @open-finance/skills`. Coordinate with Eliron (package owner) before publishing. `financy-setup` walks an agent through onboarding a user: install/npx the CLI, locate clientId/clientSecret/userId in Financy → Settings → API, run `setup --no-input` from env vars, verify with `status`, and handle exit 4 by pointing at the upgrade path. `freshness-check` teaches interpreting `financy status --json`, deciding staleness, and offering `financy refresh` with explicit user confirmation of the 20-credit cost. Both follow the standing guardrails: never echo the client secret or config contents; branch on exit codes 3/4/5 rather than parsing prose; state each skill's minimum CLI version.

## Acceptance criteria

- [ ] Both SKILL.md files exist in agent-skills with manifest entries, following the repo's template
- [ ] Each skill drives the CLI via `--json` + exit codes and mentions the MCP tools as the alternative when configured
- [ ] Guardrails present verbatim in both: secret non-disclosure, credit-cost confirmation, exit-4 upgrade handling
- [ ] Dry-run: a Claude Code session following each skill against the mock prototype (or staging) completes the job unassisted
- [ ] Eliron sign-off recorded before `@open-finance/skills` publish

## Blocked by

- 02-setup-command
- 05-refresh-command
