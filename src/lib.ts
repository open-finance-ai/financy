/**
 * The importable surface of this package.
 *
 * Deliberately narrow: it is exactly what an out-of-process host needs to serve
 * the same MCP tools this CLI serves — the tool table, the dispatcher, a config
 * built from a caller's bearer token, and the version for a User-Agent. Every
 * other module stays internal so it can change without a breaking release.
 */

export { TOOLS, callTool } from './mcp/tools.js'
export type { ToolDef, ToolContext, CallToolIO, JsonSchema } from './mcp/tools.js'

export { bearerConfig } from './config.js'
export type { Config } from './config.js'

export { VERSION } from './version.js'
