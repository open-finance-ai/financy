import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { JWTVerifyGetKey } from 'jose'
import { bearerConfig } from '../config.js'
import { VERSION } from '../version.js'
import { TOOLS, callTool } from '../mcp/tools.js'
import {
  RemoteAuthError,
  remoteAuthFromEnv,
  verifyBearer,
} from './auth.js'

export const METADATA_PATH = '/.well-known/oauth-protected-resource'
export const MCP_PATH = '/mcp'

const REMOTE_TOOLS = TOOLS.filter((tool) => tool.name !== 'refresh_connections')
const REMOTE_TOOL_NAMES = new Set(REMOTE_TOOLS.map((tool) => tool.name))

const sendJson = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

const MAX_BODY_BYTES = 256 * 1024

async function readBoundedJson(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) {
      sendJson(res, 413, { error: 'payload_too_large' })
      req.destroy()
      return { ok: false }
    }
    chunks.push(chunk as Buffer)
  }
  let body: unknown
  try {
    body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
  } catch {
    sendJson(res, 400, { error: 'invalid_json' })
    return { ok: false }
  }
  if (Array.isArray(body)) {
    sendJson(res, 400, { error: 'batch_not_supported' })
    return { ok: false }
  }
  return { ok: true, body }
}

export interface RemoteHandlerOptions {
  getKey?: JWTVerifyGetKey
}

export function createRemoteHandler(
  env: NodeJS.ProcessEnv,
  options: RemoteHandlerOptions = {},
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const auth = remoteAuthFromEnv(env, options.getKey)

  return async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://placeholder').pathname

    if (req.method === 'GET' && pathname === METADATA_PATH) {
      sendJson(res, 200, {
        resource: auth.audience,
        authorization_servers: [auth.issuer],
        scopes_supported: ['mcp:read'],
        bearer_methods_supported: ['header'],
      })
      return
    }

    if (pathname !== MCP_PATH) {
      sendJson(res, 404, { error: 'not_found' })
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' })
      return
    }

    let token: string
    try {
      token = await verifyBearer(auth, req.headers.authorization)
    } catch (error) {
      const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http'
      const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host
      const message = error instanceof RemoteAuthError ? error.message : 'unauthorized'
      sendJson(res, 401, { error: 'unauthorized', message }, {
        'www-authenticate': `Bearer resource_metadata="${proto}://${host}${METADATA_PATH}"`,
      })
      return
    }

    const parsed = await readBoundedJson(req, res)
    if (!parsed.ok) return

    const server = new Server(
      { name: 'financy', version: VERSION },
      { capabilities: { tools: {} } },
    )

    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: REMOTE_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    }))

    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const name = request.params.name
      const result = REMOTE_TOOL_NAMES.has(name)
        ? await callTool(name, request.params.arguments ?? {}, {
          env,
          config: bearerConfig(env, token, extra.signal),
        })
        : { error: { code: 'UNKNOWN_TOOL', message: `no tool named '${name}'` } }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    })

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, parsed.body)
  }
}

export function startRemoteServer(
  env: NodeJS.ProcessEnv,
  port: number,
  options: RemoteHandlerOptions = {},
): Promise<HttpServer> {
  const handler = createRemoteHandler(env, options)
  const httpServer = createServer((req, res) => {
    void handler(req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' })
      else res.end()
    })
  })
  return new Promise((resolve) => {
    httpServer.listen(port, () => resolve(httpServer))
  })
}
