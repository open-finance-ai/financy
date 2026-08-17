import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

export class RemoteAuthError extends Error {}

export interface RemoteAuth {
  issuer: string
  audience: string
  getKey: JWTVerifyGetKey
}

export function remoteAuthFromEnv(
  env: NodeJS.ProcessEnv,
  getKey?: JWTVerifyGetKey,
): RemoteAuth {
  const domain = env.FINANCY_MCP_AUTH0_DOMAIN
  if (!domain) {
    throw new Error('FINANCY_MCP_AUTH0_DOMAIN is required to run the remote MCP server')
  }
  const issuer = `https://${domain}/`
  return {
    issuer,
    audience: env.FINANCY_MCP_AUDIENCE ?? 'https://mcp.open-finance.ai/',
    getKey: getKey ?? createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`)),
  }
}

export async function verifyBearer(
  auth: RemoteAuth,
  header: string | undefined,
): Promise<string> {
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
  if (!token) throw new RemoteAuthError('missing bearer token')

  let scope: unknown
  try {
    const { payload } = await jwtVerify(token, auth.getKey, {
      issuer: auth.issuer,
      audience: auth.audience,
      requiredClaims: ['exp'],
    })
    scope = payload.scope
  } catch {
    throw new RemoteAuthError('invalid or expired token')
  }

  const scopes = typeof scope === 'string' ? scope.split(' ') : []
  if (!scopes.includes('mcp:read')) {
    throw new RemoteAuthError('token is missing the mcp:read scope — reconnect the Financy connector')
  }
  return token
}
