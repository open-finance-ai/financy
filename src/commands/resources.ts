import { renderTable, type Column } from '../render.js'
import { EXIT } from '../exit-codes.js'
import type { ListEnvelope, GetEnvelope } from '../core/read.js'

export interface RenderContext {
  json: boolean
  out: (chunk: string) => void
}

/** Render a pre-fetched list envelope (JSON envelope under `--json`, else a table). */
export function renderList<T>(
  ctx: RenderContext,
  envelope: ListEnvelope<T>,
  columns: Column<T>[],
): number {
  if (ctx.json) {
    ctx.out(
      JSON.stringify(
        { data: envelope.data, count: envelope.count, nextPage: envelope.nextPage },
        null,
        2,
      ),
    )
  } else {
    ctx.out(renderTable(envelope.data, columns))
  }
  return EXIT.OK
}

/** Render a pre-fetched single-resource envelope. */
export function renderGet<T>(ctx: RenderContext, envelope: GetEnvelope<T>): number {
  if (ctx.json) {
    ctx.out(JSON.stringify({ data: envelope.data }, null, 2))
  } else {
    ctx.out(JSON.stringify(envelope.data, null, 2) + '\n')
  }
  return EXIT.OK
}
