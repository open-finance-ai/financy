# Walking skeleton: repo + `financy status` end-to-end

Status: ready-for-agent (AFK)

## Parent

PRD: `../PRD.md` (financy CLI v1)

## What to build

A new repository containing the `@open-finance/cli` package (TypeScript, commander, Node ≥20, binary `financy`) with exactly one working command: `financy status`. The slice cuts through everything once: credentials from `FINANCY_CLIENT_ID`/`FINANCY_CLIENT_SECRET`/`FINANCY_USER_ID` env vars → Auth0 client-credentials token mint with the non-standard `userId` body field → token cached with its JWT `exp`, transparently re-minted on expiry or 401 → `GET /v2/connections` → per-connection fresh/stale/error rollup rendered as a human table by default and `{data, count, nextPage}` JSON under `--json`, errors as `{error:{code,message}}` on stderr, granular exit codes (0/1/2/3/4/7 relevant here). Every request sends `User-Agent: financy-cli/<version>`. The interface (copy, layout, exit codes) follows the locked prototype at `../prototype/`.

## Acceptance criteria

- [ ] `npx .` / `financy status` renders the rollup from recorded fixtures via a mocked HTTP layer in tests: fresh/stale/error marks, data-through dates, consent expiry, refresh nudge
- [ ] `--json` emits the stable envelope; stderr stays clean on success
- [ ] Auth failures exit 3, plan-403 (`NOT_AVAILABLE_ON_PLAN`) exits 4, network failure exits 7 — asserted in tests against a fake token endpoint / mocked API
- [ ] Token is minted once, cached, and re-minted on expiry and on 401 (tested)
- [ ] `financy help` shows the full v1 command tree (stubs may error with exit 2 "not implemented yet")
- [ ] CI runs lint + tests on push

## Blocked by

None — can start immediately.
