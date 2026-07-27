/**
 * Build a syntactically valid (unsigned) JWT for tests. The CLI only reads the
 * `exp` claim from the token payload to decide when to re-mint; it does not
 * verify the signature (the API does). `exp` is seconds since the epoch.
 */
export function makeJwt(claims: Record<string, unknown>): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  const header = b64({ alg: 'RS256', typ: 'JWT' })
  const payload = b64(claims)
  return `${header}.${payload}.signature`
}
