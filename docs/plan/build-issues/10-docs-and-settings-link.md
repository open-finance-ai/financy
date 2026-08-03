# Docs + Settings link

Status: ready-for-agent (AFK)

## Parent

PRD: `../PRD.md` (financy CLI v1)

## What to build

Launch documentation. The repo README is the full reference: install (`npx financy`, `npm i -g financy`), setup and credentials, every command with examples, the `--json` envelope, exit-code table, MCP setup one-liner, skills install (`financy skills install --all`), and the paid-plan requirement stated up front. A page on docs-financy.open-finance.ai covers install + credentials + quickstart and links to the README for depth. Financy web → Settings → API gains a link to that docs page next to the credentials it already shows.

## Acceptance criteria

- [ ] README covers all commands, flags, exit codes, JSON envelope, MCP, and skills install, with copy-pasteable examples
- [ ] docs-financy.open-finance.ai page published: install, credentials walkthrough (with where-to-find screenshots or equivalent), quickstart, plan requirement
- [ ] Settings → API in the web app links to the docs page (web-financy-app change)
- [ ] A cold-start dry-run following only the docs gets from nothing to `financy status` output

## Blocked by

- 02-setup-command
- 06-update-and-release-pipeline
