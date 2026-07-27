import type { Config } from '../config.js'
import { type Connection } from '../api.js'
import { fetchStatus, STALE_THRESHOLD_DAYS } from '../core/status.js'

export interface StatusContext {
  config: Config
  json: boolean
  now: Date
  out: (chunk: string) => void
  err: (chunk: string) => void
}

/** `financy status` — per-connection freshness rollup. */
export async function statusCommand(ctx: StatusContext): Promise<number> {
  const { data, staleThresholdDays, connections } = await fetchStatus(ctx.config, ctx.now)

  if (ctx.json) {
    ctx.out(JSON.stringify({ data, staleThresholdDays }, null, 2))
    return 0
  }

  ctx.out(renderTable(connections, ctx.now))
  return 0
}

/** Whole days between a `YYYY-MM-DD` data date and `now` (UTC calendar days), or null if unparseable. */
function daysAgo(dataDate: string | undefined, now: Date): number | null {
  if (!dataDate) return null
  const [y, m, d] = dataDate.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined) return null
  const dataMidnight = Date.UTC(y, m - 1, d)
  const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((nowMidnight - dataMidnight) / 86_400_000)
}

/** Render a connection `error` of unknown shape into a readable one-liner (or null). */
function formatError(err: unknown): string | null {
  if (!err || typeof err !== 'object') return err ? String(err) : null
  const e = err as Record<string, unknown>
  const code = e.code ?? e.type ?? e.errorCode
  const message = e.message ?? e.description ?? e.reason
  if (code || message) return `${code ?? 'error'}: ${message ?? ''}`.trim()
  return JSON.stringify(err)
}

type Mark = { symbol: string; needsAttention: boolean }

function classify(c: Connection, days: number | null): Mark {
  if (c.status !== 'ACTIVE') return { symbol: `✗ ${c.status}`, needsAttention: true }
  if (days === null) return { symbol: '● no data yet', needsAttention: true }
  if (days > STALE_THRESHOLD_DAYS) return { symbol: '● stale', needsAttention: true }
  return { symbol: '✓ fresh', needsAttention: false }
}

function renderTable(items: Connection[], now: Date): string {
  const today = now.toISOString().slice(0, 10)
  const lines: string[] = [
    `Connections (data date vs today ${today}, stale > ${STALE_THRESHOLD_DAYS}d)`,
    '',
  ]

  if (items.length === 0) {
    lines.push('  No connections yet. Connect a bank in the Financy app.', '')
    return lines.join('\n') + '\n'
  }

  let attention = 0
  const markWidth = Math.max(
    ...items.map((c) => classify(c, daysAgo(c.lastFetchedDataDate, now)).symbol.length),
  )

  for (const c of items) {
    const days = daysAgo(c.lastFetchedDataDate, now)
    const mark = classify(c, days)
    if (mark.needsAttention) attention++
    const provider = (c.providerId ?? '(pending)').padEnd(14)
    const through =
      c.lastFetchedDataDate && days !== null
        ? `data through ${c.lastFetchedDataDate} (${days}d ago)`
        : 'no data fetched yet'
    const expires = c.expiryDate ? ` · consent expires ${c.expiryDate}` : ''
    lines.push(`  ${mark.symbol.padEnd(markWidth)}  ${provider} ${through}${expires}`)
    const errText = formatError(c.error)
    if (errText) lines.push(`     ${errText}`)
  }

  lines.push('')
  if (attention > 0) {
    const noun = attention === 1 ? 'connection needs' : 'connections need'
    lines.push(
      `${attention} ${noun} attention. Run financy refresh to fetch now (20 credits).`,
    )
  } else {
    lines.push('All connections are fresh.')
  }

  return lines.join('\n') + '\n'
}
