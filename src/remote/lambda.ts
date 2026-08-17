import type { AddressInfo } from 'node:net'
import { startRemoteServer, type RemoteHandlerOptions } from './server.js'

export interface FunctionUrlEvent {
  rawPath: string
  rawQueryString?: string
  headers?: Record<string, string | undefined>
  body?: string
  isBase64Encoded?: boolean
  requestContext: { http: { method: string } }
}

export interface FunctionUrlResult {
  statusCode: number
  headers: Record<string, string>
  body: string
  isBase64Encoded: false
}

const HOP_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'expect', 'upgrade'])

export function createLambdaHandler(
  env: NodeJS.ProcessEnv,
  options: RemoteHandlerOptions = {},
): (event: FunctionUrlEvent) => Promise<FunctionUrlResult> {
  let baseUrl: Promise<string> | undefined

  const loopbackBaseUrl = (): Promise<string> => {
    baseUrl ??= startRemoteServer(env, 0, options).then((server) => {
      server.unref()
      const { port } = server.address() as AddressInfo
      return `http://127.0.0.1:${port}`
    })
    return baseUrl
  }

  return async (event) => {
    const origin = await loopbackBaseUrl()
    const search = event.rawQueryString ? `?${event.rawQueryString}` : ''

    const headers = new Headers()
    for (const [name, value] of Object.entries(event.headers ?? {})) {
      if (value !== undefined && !HOP_HEADERS.has(name.toLowerCase())) headers.set(name, value)
    }

    const method = event.requestContext.http.method
    const body = event.body === undefined || method === 'GET' || method === 'HEAD'
      ? undefined
      : event.isBase64Encoded
        ? Buffer.from(event.body, 'base64')
        : event.body

    const response = await fetch(origin + event.rawPath + search, { method, headers, body })

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, name) => {
      responseHeaders[name] = value
    })

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: await response.text(),
      isBase64Encoded: false,
    }
  }
}

export const handler = createLambdaHandler(process.env)
