import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { TOOLS, callTool } from './tools.js'
import { VERSION } from '../version.js'

/**
 * Start the stdio MCP server. Thin transport glue over the tested tool registry
 * (`tools.ts`): it lists TOOLS and routes tools/call through `callTool`, which
 * resolves config, runs the shared CLI data-core, and returns the same
 * `{data,...}` / `{error,...}` envelopes as `financy --json`.
 */
export async function startMcpServer(env: NodeJS.ProcessEnv): Promise<void> {
  const server = new Server(
    { name: 'financy', version: VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await callTool(request.params.name, request.params.arguments ?? {}, { env })
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  })

  await server.connect(new StdioServerTransport())
}
