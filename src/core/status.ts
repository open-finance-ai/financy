import type { Config } from '../config.js'
import { authorized } from '../auth.js'
import { getConnections, type Connection } from '../api.js'

/** Days since a connection's data date beyond which it is considered stale. */
export const STALE_THRESHOLD_DAYS = 2

export interface StatusRow {
  provider: string | null
  status: string
  /** The data-through date, or null when the connection has never fetched data. */
  fresh: string | null
  expires: string | null
  accounts: number
}

export interface StatusEnvelope {
  data: StatusRow[]
  staleThresholdDays: number
  /** The raw connections, retained for the human-table renderer (freshness marks, errors). */
  connections: Connection[]
}

function toRow(c: Connection): StatusRow {
  return {
    provider: c.providerId ?? null,
    status: c.status,
    fresh: c.lastFetchedDataDate ?? null,
    expires: c.expiryDate ?? null,
    accounts:
      (c.accounts ?? 0) +
      (c.cards ?? 0) +
      (c.savings ?? 0) +
      (c.loans ?? 0) +
      (c.securities ?? 0),
  }
}

/** Fetch the per-connection freshness rollup as an envelope (shared by CLI + MCP). */
export async function fetchStatus(config: Config, now: Date): Promise<StatusEnvelope> {
  const { items } = await authorized(config, now, (token) => getConnections(config, token))
  return {
    data: items.map(toRow),
    staleThresholdDays: STALE_THRESHOLD_DAYS,
    connections: items,
  }
}
