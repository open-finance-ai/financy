import type { Config } from '../config.js'
import { type RefreshResult } from '../api.js'
import { fetchRefresh } from '../core/refresh.js'
import { EXIT } from '../exit-codes.js'

export interface RefreshContext {
  config: Config
  now: Date
  json: boolean
  out: (chunk: string) => void
}

/** Human-readable copy for each success outcome (plain text; see the locked prototype). */
function renderHuman(result: RefreshResult): string {
  if (result.status === 'already_running') {
    return 'A refresh is already in flight — watch it with financy status\n'
  }
  // The live `accepted` body carries no connection count, so keep the copy generic.
  const scope =
    typeof result.connections === 'number'
      ? `${result.connections} connection${result.connections === 1 ? '' : 's'}`
      : 'your connections'
  return (
    `Refresh started for ${scope} (20 credits)\n` +
    '  Data lands in a few minutes — check financy status\n'
  )
}

/** Trigger service-chat's org-wide refresh and render the outcome. */
export async function refreshCommand(ctx: RefreshContext): Promise<number> {
  const { data } = await fetchRefresh(ctx.config, ctx.now)
  ctx.out(ctx.json ? JSON.stringify({ data }) : renderHuman(data))
  return EXIT.OK
}
