# `financy setup` + credential storage

Status: ready-for-agent (AFK)

## Parent

PRD: `../PRD.md` (financy CLI v1)

## What to build

The onboarding command. Interactive mode prompts for the three values from Financy → Settings → API (secret masked); `--no-input` reads them from the `FINANCY_*` env vars for agents/CI. Credentials persist to `~/.config/financy/config.json` (XDG-respecting) with 0600 permissions, shaped `{profiles: {default: {…}}}` for future multi-profile. Env vars always override the file at read time. Setup validates before finishing: mints a token and performs one cheap read — bad credentials fail setup (exit 3); a free-plan 403 saves the credentials but exits 4 with a clear "plan not eligible — upgrade" message. Secrets are never accepted as CLI flags.

## Acceptance criteria

- [ ] Interactive and `--no-input` flows both produce a working 0600 config file (permissions asserted in tests)
- [ ] Validation: happy path prints success + "try financy status"; invalid creds exit 3 without writing; free-plan writes config but exits 4 with the upgrade message
- [ ] Env vars override file config for all commands (tested via `status`)
- [ ] No flag accepts a secret; `--client-secret` style flags are rejected with exit 2
- [ ] Token cache lives beside the config with 0600 and is reused across invocations

## Blocked by

- 01-walking-skeleton-status
