# Skills: financy-setup + freshness-check

Status: done (2026-08-03)

## Parent

PRD: `../PRD.md` (financy CLI v1)

## What to build

The first two agent skills. **Revised 2026-08-03:** they ship inside this package under `skills/`, not in the separate `open-finance-ai/agent-skills` repo. Users install them with `financy skills install --all`, which copies each skill directory into the project's `.claude/skills/`. One package, one install path, and no second repo whose skills drift away from the command surface they drive — `@open-finance/skills` is deprecated in favour of this channel. `financy-setup` walks an agent through onboarding a user: install/npx the CLI, locate clientId/clientSecret/userId in Financy → Settings → API, run `setup --no-input` from env vars, verify with `status`, and handle exit 4 by pointing at the upgrade path. `freshness-check` teaches interpreting `financy status --json`, deciding staleness, and offering `financy refresh` with explicit user confirmation of the 20-credit cost. Both follow the standing guardrails: never echo the client secret or config contents; branch on exit codes 3/4/5 rather than parsing prose; state each skill's minimum CLI version.

## Acceptance criteria

- [x] Both SKILL.md files exist under `skills/`, with frontmatter the `financy skills` command can read
- [x] Each skill drives the CLI via `--json` + exit codes and mentions the MCP tools as the alternative when configured
- [x] Guardrails present in both: secret non-disclosure, credit-cost confirmation, exit-4 upgrade handling — asserted by `test/skills.test.ts`
- [x] `financy skills list|install` covered by tests, including the unknown-skill (exit 6) and missing-argument (exit 2) paths
- [ ] Dry-run: a Claude Code session following each skill against the mock prototype (or staging) completes the job unassisted
- [x] Single distribution channel agreed with Eliron (package owner) — `@open-finance/skills` to be deprecated

## Blocked by

- 02-setup-command
- 05-refresh-command
