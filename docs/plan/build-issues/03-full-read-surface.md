# Full read surface + pagination

Status: ready-for-agent (AFK)

## Parent

PRD: `../PRD.md` (financy CLI v1)

## What to build

The remaining read commands, each with table + `--json` output per the locked prototype: `connections list|get <id>`, `accounts list|get <id>` (balances shown; securities positions/orders embedded in account JSON), `transactions list|get <id>` with `--from --to --account --connection --type --limit` filters, `categories`, `providers list|branches`. Pagination: `nextPage` cursors surface in the JSON envelope, `--cursor` resumes, `--all` auto-paginates to exhaustion. Not-found exits 6. Table rendering pads by display width so Hebrew descriptions align.

## Acceptance criteria

- [ ] Every command listed renders fixtures correctly in both table and `--json` modes with the `{data, count, nextPage}` envelope
- [ ] All transaction filters map to the API's query params and combine correctly (fixture-asserted)
- [ ] `--all` follows cursors to the end; `--cursor` resumes mid-stream; both tested with multi-page fixtures
- [ ] `get` with an unknown id exits 6 with `{error}` on stderr in `--json` mode
- [ ] Hebrew-containing tables align (display-width padding, not `String.length`)

## Blocked by

- 01-walking-skeleton-status
