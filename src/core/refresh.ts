import type { Config } from '../config.js'
import { authorized } from '../auth.js'
import { postRefresh, type RefreshResult } from '../api.js'

/** Trigger service-chat's org-wide refresh; returns the result in the {data} envelope. */
export async function fetchRefresh(
  config: Config,
  now: Date,
): Promise<{ data: RefreshResult }> {
  const result = await authorized(config, now, (token) => postRefresh(config, token))
  return { data: result }
}
