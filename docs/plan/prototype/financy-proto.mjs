#!/usr/bin/env node
// PROTOTYPE — throwaway mock of the financy CLI interface. Fixture data only,
// no network, no persistence. Answers ticket 06 (interface design). Delete freely.
// Run: node financy-proto.mjs <command> [args] [--json]

const RESET = '\x1b[0m', BOLD = '\x1b[1m', DIM = '\x1b[2m', RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m'

// ---------- fixtures (realistic shapes from map-*.ts mappers) ----------

const CONNECTIONS = [
  {
    id: 'conn_01HTX4M9K2', providerId: 'HAPOALIM', status: 'ACTIVE', mode: 'REAL',
    accounts: 2, cards: 0, savings: 1, loans: 0, securities: 0, transactions: 412,
    startDate: '2026-01-12', expiryDate: '2026-10-12',
    lastFetchedDataDate: '2026-07-22', lastFetchedAt: '2026-07-23T04:12:09Z',
    createdAt: '2026-01-12T09:31:00Z', error: null,
  },
  {
    id: 'conn_01HV8Q2E7N', providerId: 'CAL', status: 'FETCHING_ERROR', mode: 'REAL',
    accounts: 0, cards: 2, savings: 0, loans: 0, securities: 0, transactions: 238,
    startDate: '2026-02-03', expiryDate: '2026-11-03',
    lastFetchedDataDate: '2026-07-19', lastFetchedAt: '2026-07-20T04:02:44Z',
    createdAt: '2026-02-03T14:05:00Z', error: { code: 'PROVIDER_TIMEOUT', message: 'CAL did not respond within the fetch window' },
  },
]

const ACCOUNTS = [
  {
    id: 'acc_9f2e01', connectionId: 'conn_01HTX4M9K2', providerId: 'HAPOALIM',
    accountType: 'CHECKING', accountName: 'עו"ש', accountNumber: '12-600-123456',
    parsedAccount: { bank: '12', branch: '600', number: '123456' },
    currency: 'ILS', balances: [{ amount: 18432.55, currency: 'ILS', type: 'closingBooked' }],
    creditLimit: 20000, transactions: 380,
  },
  {
    id: 'acc_3ab774', connectionId: 'conn_01HV8Q2E7N', providerId: 'CAL',
    accountType: 'CARD', accountName: 'Visa CAL ****4412', accountNumber: '4412',
    currency: 'ILS', balances: [{ amount: -6210.9, currency: 'ILS', type: 'interimAvailable' }],
    cardDueDate: '2026-08-02', transactions: 238,
  },
  {
    id: 'acc_c51d20', connectionId: 'conn_01HTX4M9K2', providerId: 'HAPOALIM',
    accountType: 'SAVINGS', accountName: 'פיקדון שקלי', accountNumber: '12-600-778901',
    currency: 'ILS', balances: [{ amount: 55000, currency: 'ILS', type: 'closingBooked' }],
    transactions: 12,
  },
]

const TRANSACTIONS = [
  { id: 'txn_01J2A', accountId: 'acc_9f2e01', type: 'BANK', amount: { chargedAmount: -1200 }, description: 'העברה לועד הבית', merchantName: null, category: { main: 'Housing', sub: 'HOA' }, date: { transactionDate: '2026-07-21' } },
  { id: 'txn_01J2B', accountId: 'acc_3ab774', type: 'CARD', amount: { chargedAmount: -84.9 }, description: 'שופרסל דיל רמת גן', merchantName: 'שופרסל', category: { main: 'Groceries', sub: 'Supermarket' }, date: { transactionDate: '2026-07-21' } },
  { id: 'txn_01J2C', accountId: 'acc_9f2e01', type: 'BANK', amount: { chargedAmount: 28400 }, description: 'משכורת יולי', merchantName: null, category: { main: 'Income', sub: 'Salary' }, date: { transactionDate: '2026-07-20' } },
  { id: 'txn_01J2D', accountId: 'acc_3ab774', type: 'CARD', amount: { chargedAmount: -49 }, description: 'NETFLIX.COM', merchantName: 'Netflix', category: { main: 'Entertainment', sub: 'Streaming' }, date: { transactionDate: '2026-07-19' } },
  { id: 'txn_01J2E', accountId: 'acc_3ab774', type: 'CARD', amount: { chargedAmount: -312.4 }, description: 'סונול תל אביב', merchantName: 'סונול', category: { main: 'Transport', sub: 'Fuel' }, date: { transactionDate: '2026-07-18' } },
]

// ---------- exit codes (the proposed contract) ----------
// 0 success | 1 unexpected | 2 usage | 3 auth | 4 plan-not-eligible
// 5 insufficient-credits | 6 not-found | 7 api-unavailable

const EXIT = { OK: 0, UNEXPECTED: 1, USAGE: 2, AUTH: 3, PLAN: 4, CREDITS: 5, NOT_FOUND: 6, API: 7 }

// ---------- plumbing ----------

const argv = process.argv.slice(2)
const flags = {}
const words = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const eq = a.indexOf('=')
    if (eq > -1) flags[a.slice(2, eq)] = a.slice(eq + 1)
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) { flags[a.slice(2)] = argv[++i] }
    else flags[a.slice(2)] = true
  } else words.push(a)
}
const JSON_MODE = !!flags.json

function ok(data, meta = {}) {
  if (JSON_MODE) { console.log(JSON.stringify({ data, ...meta }, null, 2)); process.exit(EXIT.OK) }
}
function fail(exitCode, code, message, extra = {}) {
  const payload = { error: { code, message, ...extra } }
  if (JSON_MODE) console.error(JSON.stringify(payload))
  else console.error(`${RED}error${RESET} ${code}: ${message}`)
  process.exit(exitCode)
}
function table(rows, cols) {
  const widths = cols.map(c => Math.max(c.h.length, ...rows.map(r => String(c.v(r) ?? '').length)))
  const line = (cells, pad = ' ') => cells.map((s, i) => String(s ?? '').padEnd(widths[i], pad)).join('  ')
  console.log(DIM + line(cols.map(c => c.h)) + RESET)
  rows.forEach(r => console.log(line(cols.map(c => c.v(r)))))
}
const ils = n => (n < 0 ? '-' : '') + '₪' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 })

// ---------- commands ----------

const HELP = `${BOLD}financy${RESET} — your Open-Finance data, in the terminal  ${DIM}(PROTOTYPE)${RESET}

${BOLD}USAGE${RESET}
  financy <command> [subcommand] [flags]

${BOLD}COMMANDS${RESET}
  setup                  Save your API credentials (from Financy → Settings → API)
  status                 Are my connections fresh? One-line-per-bank rollup
  connections list|get   Bank/card connections and their fetch state
  accounts list|get      Accounts with balances (securities embedded)
  transactions list|get  Transactions with filters
  refresh                Trigger an on-demand refresh of all connections (20 credits)
  categories             The category taxonomy (English + Hebrew)
  providers list|branches Reference data: banks and branches
  update                 Update the CLI to the latest version

${BOLD}GLOBAL FLAGS${RESET}
  --json                 Machine-readable output (stable schema, errors as JSON on stderr)
  --limit <n>            Page size (default 100)
  --all                  Auto-paginate to the end
  --cursor <token>       Resume from a nextPage cursor

${BOLD}EXAMPLES${RESET}
  financy status
  financy transactions list --from 2026-07-01 --to 2026-07-23 --account acc_3ab774 --json
  financy accounts list --type CARD --json | jq '.data[].balances'

Docs: https://docs.open-finance.ai/cli    Exit codes: financy help exit-codes
`

const EXIT_HELP = `${BOLD}Exit codes${RESET}
  0  success
  1  unexpected error
  2  usage error (bad flag/argument)
  3  authentication failed (bad or revoked credentials)
  4  plan not eligible (Financy free plan — upgrade to starter/pro)
  5  insufficient credits (refresh costs 20)
  6  not found
  7  API unavailable / network error
`

const [cmd, sub] = words

switch (cmd) {
  case undefined:
  case 'help':
    console.log(words[1] === 'exit-codes' ? EXIT_HELP : HELP)
    process.exit(EXIT.OK)

  case 'setup': {
    if (flags['no-input']) {
      console.log(`${GREEN}✓${RESET} Credentials read from FINANCY_* environment variables`)
    } else {
      console.log(`${BOLD}financy setup${RESET} — paste the values from Financy → Settings → API\n`)
      console.log(`${DIM}? Client ID:${RESET} q1w2e3r4t5y6`)
      console.log(`${DIM}? Client secret:${RESET} ************`)
      console.log(`${DIM}? User ID:${RESET} google-oauth2|1044…`)
    }
    console.log(`${DIM}Validating…${RESET} minted token, read 2 connections`)
    console.log(`${GREEN}✓${RESET} Saved to ~/.config/financy/config.json (permissions 600)`)
    console.log(`\nTry: ${BOLD}financy status${RESET}`)
    process.exit(EXIT.OK)
  }

  case 'status': {
    const rows = CONNECTIONS.map(c => ({
      provider: c.providerId, status: c.status,
      fresh: c.lastFetchedDataDate, expires: c.expiryDate,
      accounts: c.accounts + c.cards + c.savings + c.loans + c.securities,
    }))
    ok(rows, { staleThresholdDays: 2 })
    console.log(`${BOLD}Connections${RESET} ${DIM}(data date vs today 2026-07-23, stale > 2d)${RESET}\n`)
    for (const c of CONNECTIONS) {
      const days = Math.round((Date.parse('2026-07-23') - Date.parse(c.lastFetchedDataDate)) / 86400000)
      const mark = c.status !== 'ACTIVE' ? `${RED}✗ ${c.status}${RESET}` : days > 2 ? `${YELLOW}● stale${RESET}` : `${GREEN}✓ fresh${RESET}`
      console.log(`  ${mark}  ${BOLD}${c.providerId.padEnd(10)}${RESET} data through ${c.lastFetchedDataDate} (${days}d ago) · consent expires ${c.expiryDate}`)
      if (c.error) console.log(`     ${DIM}${c.error.code}: ${c.error.message}${RESET}`)
    }
    console.log(`\n${DIM}1 connection needs attention. Run${RESET} financy refresh ${DIM}to fetch now (20 credits).${RESET}`)
    process.exit(EXIT.OK)
  }

  case 'connections': {
    if (sub === 'get') {
      const c = CONNECTIONS.find(x => x.id === words[2])
      if (!c) fail(EXIT.NOT_FOUND, 'CONNECTION_NOT_FOUND', `no connection ${words[2]} in your scope`)
      ok(c)
      console.log(JSON.stringify(c, null, 2)); process.exit(EXIT.OK)
    }
    ok(CONNECTIONS, { count: CONNECTIONS.length, nextPage: null })
    table(CONNECTIONS, [
      { h: 'ID', v: r => r.id }, { h: 'PROVIDER', v: r => r.providerId }, { h: 'STATUS', v: r => r.status },
      { h: 'DATA THROUGH', v: r => r.lastFetchedDataDate }, { h: 'EXPIRES', v: r => r.expiryDate }, { h: 'TXNS', v: r => r.transactions },
    ])
    process.exit(EXIT.OK)
  }

  case 'accounts': {
    if (sub === 'get') {
      const a = ACCOUNTS.find(x => x.id === words[2])
      if (!a) fail(EXIT.NOT_FOUND, 'ACCOUNT_NOT_FOUND', `no account ${words[2]} in your scope`)
      ok(a); console.log(JSON.stringify(a, null, 2)); process.exit(EXIT.OK)
    }
    let rows = ACCOUNTS
    if (flags.type) rows = rows.filter(a => a.accountType === String(flags.type).toUpperCase())
    ok(rows, { count: rows.length, nextPage: null })
    table(rows, [
      { h: 'ID', v: r => r.id }, { h: 'TYPE', v: r => r.accountType }, { h: 'NAME', v: r => r.accountName },
      { h: 'PROVIDER', v: r => r.providerId }, { h: 'BALANCE', v: r => ils(r.balances[0].amount) },
    ])
    process.exit(EXIT.OK)
  }

  case 'transactions': {
    if (sub === 'get') {
      const t = TRANSACTIONS.find(x => x.id === words[2])
      if (!t) fail(EXIT.NOT_FOUND, 'TRANSACTION_NOT_FOUND', `no transaction ${words[2]} in your scope`)
      ok(t); console.log(JSON.stringify(t, null, 2)); process.exit(EXIT.OK)
    }
    let rows = TRANSACTIONS
    if (flags.account) rows = rows.filter(t => t.accountId === flags.account)
    if (flags.from) rows = rows.filter(t => t.date.transactionDate >= flags.from)
    if (flags.to) rows = rows.filter(t => t.date.transactionDate <= flags.to)
    if (flags.type) rows = rows.filter(t => t.type === String(flags.type).toUpperCase())
    ok(rows, { count: rows.length, nextPage: rows.length >= (flags.limit ?? 100) ? 'eyJQSyI6Ik9SR8OiwoDCpiJ9' : null })
    table(rows, [
      { h: 'DATE', v: r => r.date.transactionDate }, { h: 'AMOUNT', v: r => ils(r.amount.chargedAmount) },
      { h: 'DESCRIPTION', v: r => r.description }, { h: 'CATEGORY', v: r => `${r.category.main}/${r.category.sub}` },
      { h: 'TYPE', v: r => r.type }, { h: 'ID', v: r => r.id },
    ])
    process.exit(EXIT.OK)
  }

  case 'refresh': {
    // Flip these to demo the other outcomes:
    const OUTCOME = flags.demo ?? 'accepted' // accepted | already_running | no_credits | free_plan
    if (OUTCOME === 'no_credits') fail(EXIT.CREDITS, 'INSUFFICIENT_CREDITS', 'an initiated refresh costs 20 credits; you have 6', { cost: 20, balance: 6 })
    if (OUTCOME === 'free_plan') fail(EXIT.PLAN, 'NOT_AVAILABLE_ON_PLAN', 'the API is available on Starter and Pro plans — upgrade in Financy → Settings → Plan')
    const res = { status: OUTCOME, connections: 2, cost: 20 }
    ok(res)
    if (OUTCOME === 'already_running') console.log(`${YELLOW}●${RESET} A refresh is already in flight — watch it with ${BOLD}financy status${RESET}`)
    else console.log(`${GREEN}✓${RESET} Refresh started for 2 connections (20 credits)\n  Data lands in a few minutes — check ${BOLD}financy status${RESET}`)
    process.exit(EXIT.OK)
  }

  case 'categories': {
    const cats = [{ main: 'Groceries', he: 'מזון וסופר', subs: ['Supermarket', 'Butcher'] }, { main: 'Transport', he: 'תחבורה', subs: ['Fuel', 'Parking', 'Public'] }]
    ok(cats); console.log(JSON.stringify(cats, null, 2)); process.exit(EXIT.OK)
  }

  case 'providers': {
    const provs = [{ id: 'HAPOALIM', name: 'בנק הפועלים', type: 'BANK' }, { id: 'CAL', name: 'כאל', type: 'CARD' }]
    ok(provs)
    table(provs, [{ h: 'ID', v: r => r.id }, { h: 'NAME', v: r => r.name }, { h: 'TYPE', v: r => r.type }])
    process.exit(EXIT.OK)
  }

  case 'update':
    console.log(`${GREEN}✓${RESET} financy 1.0.0 → 1.1.2 (npm i -g @open-finance/cli)`)
    process.exit(EXIT.OK)

  default:
    fail(EXIT.USAGE, 'UNKNOWN_COMMAND', `unknown command '${cmd}' — run financy help`)
}
