---
name: financy-setup
description: >
  Onboard a user onto the financy CLI so their Open-Finance banking data is
  available to you. Use when the user asks to "set up financy", "connect my
  bank data", "configure the financy CLI", when any financy command fails with
  a NOT_CONFIGURED or AUTH error, or when you need account/transaction data and
  no working financy credentials exist yet. Covers installing the CLI, locating
  clientId/clientSecret/userId in the Financy app, saving them without ever
  reading the secret, verifying the result, and explaining the paid-plan
  requirement when the account is not eligible.
---

# financy setup

Get the `financy` CLI configured and verified for this user. When you are done,
`financy status` exits `0` and every other financy command works.

**Minimum CLI version:** 0.1.0

## Guardrails

These are not optional and they apply to every step below.

- **Never echo the client secret.** Do not print it, do not read it back for
  confirmation, do not write it into a file the user can see in the transcript,
  and do not include it in a summary. Pass it to the CLI through an environment
  variable and let the CLI persist it. If the user pastes it into the chat, do
  not repeat it — acknowledge and move on. The same applies to the contents of
  the config file: never `cat` it.
- **Confirm before spending credits.** `financy refresh` costs 20 credits per
  run. Never run it without the user explicitly agreeing to that cost in this
  conversation.
- **Exit code 4 means the plan, not the credentials.** The credentials are
  valid but the account is not on a paid plan. Do not retry, do not suggest
  re-entering the credentials — point the user at the upgrade path and stop.

## What the user needs before you start

The financy data API is a paid feature. To finish this skill the user must have:

1. A registered Financy account at <https://open-finance.ai>.
2. A **paid plan** — Starter or Pro. The data API is not available on the free
   plan.
3. Three values from the Financy app → **Settings → API**: `clientId`,
   `clientSecret`, and `userId`.

If the user does not have a paid plan yet, say so up front rather than letting
them collect credentials that will fail at the last step.

## Method

### 1. Check whether it is already configured

```bash
financy status --json
```

Branch on the exit code:

- `0` — already configured and working. Report the connection summary and stop;
  there is nothing to set up.
- `3` with `"code":"NOT_CONFIGURED"` — no credentials yet. Continue to step 2.
- `3` with any other code — credentials exist but are rejected. Continue to
  step 2 to replace them.
- `4` — credentials are fine, the plan is not. Jump to *Handling exit 4*.
- `127` / command-not-found — the CLI is not installed. Continue to step 2.

### 2. Make the CLI available

Prefer a global install so later sessions do not re-download it:

```bash
npm install -g financy
```

If the user cannot or does not want to install globally, every command in this
skill also works as `npx financy <command>`.

### 3. Collect the three values

Ask the user to open the Financy app → **Settings → API** and provide
`clientId`, `clientSecret`, and `userId`.

Ask for all three in one message so they only make one trip. Tell them
explicitly that you will not echo the secret back.

### 4. Save them

Run setup in non-interactive mode with the values supplied as environment
variables, so nothing lands in the command line or the transcript:

```bash
FINANCY_CLIENT_ID='…' FINANCY_CLIENT_SECRET='…' FINANCY_USER_ID='…' financy setup --no-input
```

`setup` validates the credentials against the live API before saving, so a wrong
value fails here rather than later. On success it writes
`~/.config/financy/config.json` with permissions `600`.

Exit codes from `setup`:

- `0` — saved and verified.
- `3` — the credentials were rejected. Ask the user to re-copy them; a partial
  paste or a stray space is the usual cause.
- `4` — the credentials are valid but the plan is not eligible. The CLI still
  saves them so a later upgrade works immediately. Go to *Handling exit 4*.
- `7` — the API could not be reached. This is a network or endpoint problem, not
  a credential problem; retry once, then report it.

### 5. Verify

```bash
financy status
```

Exit `0` with a connection table means setup is done. Report what you see:
how many connections there are, and whether any are stale or in error. If the
user has no connections yet, tell them to connect a bank in the Financy app —
the CLI reads data, it does not create connections.

If anything looks stale, do not refresh on your own initiative. Hand off to the
`freshness-check` skill, which knows how to weigh staleness against the 20-credit
cost.

## Handling exit 4

Exit `4` (`NOT_AVAILABLE_ON_PLAN`) means the account is registered and the
credentials are correct, but the plan does not include the data API.

Tell the user, in plain terms:

> Your credentials are valid, but the data API needs a paid plan (Starter or
> Pro). You can upgrade at <https://open-finance.ai> — the credentials are
> already saved, so `financy status` will work as soon as the plan is active.

Then stop. Do not retry the command, do not ask for different credentials, and
do not look for a workaround.

## Non-interactive and CI environments

If `FINANCY_CLIENT_ID`, `FINANCY_CLIENT_SECRET` and `FINANCY_USER_ID` are
already present in the environment, the CLI reads them directly and no config
file is needed. `financy setup --no-input` is only useful when you want them
persisted for future sessions.

To see which endpoints and credential sources are in effect without exposing
the secret:

```bash
financy config
```

It prints the resolved endpoints and marks each credential as coming from the
environment or the config file, with the secret masked.

## MCP alternative

If the user runs agents against the financy MCP server instead of the CLI, the
same surface is available as tools. Register it once:

```bash
claude mcp add financy -- npx financy mcp
```

The server resolves credentials exactly as the CLI does. Until setup is
complete, every tool returns a structured `NOT_CONFIGURED` error — which is your
signal to run this skill.
