# `financy refresh`

Status: ready-for-agent (AFK)

## Parent

PRD: `../PRD.md` (financy CLI v1)

## What to build

The one action command: `financy refresh` calls service-chat's initiated refresh (org-wide, flat 20 credits). Outcome mapping per the locked prototype: `accepted` and `already_running` both succeed (exit 0) with copy pointing at `financy status` to watch progress; HTTP 409 (no refreshable connections) exits 1 with the server's message; HTTP 402 exits 5 with cost and balance in the JSON error body. The command states the 20-credit cost in its help text.

## Acceptance criteria

- [ ] All four outcomes (accepted / already_running / 409 / 402) map to the specced exit codes and copy, fixture-tested in both output modes
- [ ] `--json` success emits the server's result object in the standard envelope
- [ ] Help text and `financy status` nudge mention the 20-credit cost
- [ ] Verified once against staging with a real paid-org M2M token (needs the backend scope slice deployed)

## Blocked by

- 01-walking-skeleton-status
- 04-backend-refresh-scope
