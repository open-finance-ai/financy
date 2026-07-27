# financy CLI — prototype transcript (ticket 06 asset)

Generated from `financy-proto.mjs` (fixture data, no network). Run it yourself:
`node docs/plan/prototype/financy-proto.mjs <command>`

```
$ financy help
financy — your Open-Finance data, in the terminal  (PROTOTYPE)

USAGE
  financy <command> [subcommand] [flags]

COMMANDS
  setup                  Save your API credentials (from Financy → Settings → API)
  status                 Are my connections fresh? One-line-per-bank rollup
  connections list|get   Bank/card connections and their fetch state
  accounts list|get      Accounts with balances (securities embedded)
  transactions list|get  Transactions with filters
  refresh                Trigger an on-demand refresh of all connections (20 credits)
  categories             The category taxonomy (English + Hebrew)
  providers list|branches Reference data: banks and branches
  update                 Update the CLI to the latest version

GLOBAL FLAGS
  --json                 Machine-readable output (stable schema, errors as JSON on stderr)
  --limit <n>            Page size (default 100)
  --all                  Auto-paginate to the end
  --cursor <token>       Resume from a nextPage cursor

EXAMPLES
  financy status
  financy transactions list --from 2026-07-01 --to 2026-07-23 --account acc_3ab774 --json
  financy accounts list --type CARD --json | jq '.data[].balances'

Docs: https://docs.open-finance.ai/cli    Exit codes: financy help exit-codes

```

```
$ financy setup
financy setup — paste the values from Financy → Settings → API

? Client ID: q1w2e3r4t5y6
? Client secret: ************
? User ID: google-oauth2|1044…
Validating… minted token, read 2 connections
✓ Saved to ~/.config/financy/config.json (permissions 600)

Try: financy status
```

```
$ financy status
Connections (data date vs today 2026-07-23, stale > 2d)

  ✓ fresh  HAPOALIM   data through 2026-07-22 (1d ago) · consent expires 2026-10-12
  ✗ FETCHING_ERROR  CAL        data through 2026-07-19 (4d ago) · consent expires 2026-11-03
     PROVIDER_TIMEOUT: CAL did not respond within the fetch window

1 connection needs attention. Run financy refresh to fetch now (20 credits).
```

```
$ financy connections list
error UNKNOWN_COMMAND: unknown command 'connections list' — run financy help
(exit code: 2)
```

```
$ financy accounts list
error UNKNOWN_COMMAND: unknown command 'accounts list' — run financy help
(exit code: 2)
```

```
$ financy accounts list --json
error UNKNOWN_COMMAND: unknown command 'accounts list --json' — run financy help
(exit code: 2)
```

```
$ financy transactions list --from 2026-07-19 --account acc_3ab774
error UNKNOWN_COMMAND: unknown command 'transactions list --from 2026-07-19 --account acc_3ab774' — run financy help
(exit code: 2)
```

```
$ financy transactions list --json
error UNKNOWN_COMMAND: unknown command 'transactions list --json' — run financy help
(exit code: 2)
```

```
$ financy refresh
✓ Refresh started for 2 connections (20 credits)
  Data lands in a few minutes — check financy status
```

```
$ financy refresh --demo no_credits --json
error UNKNOWN_COMMAND: unknown command 'refresh --demo no_credits --json' — run financy help
(exit code: 2)
```

```
$ financy refresh --demo free_plan
error UNKNOWN_COMMAND: unknown command 'refresh --demo free_plan' — run financy help
(exit code: 2)
```

```
$ financy accounts get acc_nope
error UNKNOWN_COMMAND: unknown command 'accounts get acc_nope' — run financy help
(exit code: 2)
```

```
$ financy help exit-codes
error UNKNOWN_COMMAND: unknown command 'help exit-codes' — run financy help
(exit code: 2)
```

