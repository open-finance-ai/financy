# MCP server mode

Status: ready-for-agent (AFK)

## Parent

PRD: `../PRD.md` (financy CLI v1)

## What to build

`financy mcp` runs a stdio MCP server (official TypeScript MCP SDK) exposing the command surface 1:1 as verb_noun tools: `list_connections`, `get_connection`, `list_accounts`, `get_account`, `list_transactions`, `get_transaction`, `list_categories`, `list_providers`, `list_bank_branches`, `get_status`, `refresh_connections`. Tools share the CLI's handlers, config resolution, and `{data, count, nextPage}` envelope with the same default limit — no MCP-specific caps or summarizing. Each tool description is the agent-facing usage spec (when to use, filters, pagination, cross-tool guidance); `refresh_connections`'s description states the 20-credit cost and instructs agents to confirm with the user first. Unconfigured credentials produce the same machine-readable auth error on every tool.

## Acceptance criteria

- [ ] `claude mcp add financy -- npx financy mcp` yields a working server (documented in README; verified manually once)
- [ ] All eleven tools return fixture-correct envelopes at the tool-call boundary, reusing the CLI test fixtures
- [ ] `limit`/`cursor` params work on list tools; defaults match the CLI
- [ ] Tool descriptions reviewed against the service-chat descriptions-as-spec convention; refresh carries the cost warning
- [ ] Unconfigured state returns the structured auth error from every tool (tested)

## Blocked by

- 03-full-read-surface
