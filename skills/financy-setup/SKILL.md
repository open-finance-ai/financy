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

- **Never handle the client secret at all.** Do not ask the user to paste it into
  the conversation, and never place it in a command you run — a command you run
  is recorded in the transcript, and it is visible in shell history and to
  anything that can list processes. The user types the secret into
  `financy setup`, which masks it at the prompt; you never see it. If the user
  pastes it anyway, do not repeat it, do not use it in a command, and tell them
  to rotate it in Financy → Settings → API. Never print it, read it back for
  confirmation, or include it in a summary, and never `cat` the config file.
  If `setup` warns that the input is **not masked** (a terminal where Node cannot
  hide input, e.g. Git Bash / mintty, where stdin is a pipe), tell the user to run
  it in PowerShell or Windows Terminal instead of typing the secret in the clear.
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

### 3. Have the user run setup themselves

**Do not collect the credentials and run setup for them.** Ask the user to run
this in their own terminal:

```bash
financy setup
```

It prompts for `clientId`, `clientSecret` and `userId` in turn, and **masks the
secret as they type it** — so the secret goes straight from the user to the CLI
and never passes through you, this conversation, or a command line. Tell them
where to find the three values: the Financy app → **Settings → API**.

`setup` validates the credentials against the live API before saving, so a wrong
value fails immediately rather than on their first real command. On success it
writes `~/.config/financy/config.json` and prints the path — permissions `600` on
macOS/Linux; on Windows the path is
`%USERPROFILE%\.config\financy\config.json` and file modes are not enforced.

A **failed** `setup` writes nothing at all. If the user believes they entered the
credentials but `financy config` shows them unset, setup did not get past
validation — do not go looking for a file-reading problem.

On Windows the secret prompt prints one `*` per character. If the user says they
pasted and saw no `*`s, their console did not paste: the legacy Windows console
ignores **Ctrl+V** at a prompt. Tell them to use **right-click** or
**Ctrl+Shift+V**, or to type the value.

Ask the user to tell you the exit code or what it printed — that is all you need.
Do not ask them to paste any of the three values.

Exit codes from `setup`:

- `0` — saved and verified.
- `3` — the credentials were rejected, and nothing was saved. Ask them to run
  `financy setup` again and re-copy the values; a partial paste is the usual
  cause (surrounding whitespace and wrapping quotes are stripped automatically).
  Have them check that `Client ID` and `User ID` did not go into each other's
  prompt — `financy config` shows the `userId` in the clear, so a swap is visible
  there.
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
**already present in the environment** — put there by CI, a secret manager, or
the user's own shell profile — the CLI reads them directly and no config file is
needed. There is nothing for you to do; just run `financy status` and continue.

`financy setup --no-input` reads those same variables and persists them for
future sessions. Use it only when the environment already carries them. Never
set them yourself as a prefix to the command in order to pass along a secret the
user gave you — `FINANCY_CLIENT_SECRET=… financy setup --no-input` puts the
secret in the command line, which defeats the whole point. In that situation the
answer is always step 3: let the user run `financy setup` and type it.

To see which endpoints and credential sources are in effect without exposing
the secret:

```bash
financy config
```

It prints the resolved endpoints, the state of the config file (`ok`, `missing`,
`malformed`, `unreadable`), and marks each credential as coming from the
environment or the config file. The secret is never printed — only its length,
which is enough to spot a truncated paste. This is the first command to run when a
user reports a `401`.

## MCP alternative

If the user runs agents against the financy MCP server instead of the CLI, the
same surface is available as tools. Register it once:

```bash
claude mcp add financy -- npx financy mcp
```

The server resolves credentials exactly as the CLI does. Until setup is
complete, every tool returns a structured `NOT_CONFIGURED` error — which is your
signal to run this skill.
