export default {
  async fetch(request, env) {
    const inUrl = new URL(request.url)
    const upstreamUrl = `https://${env.LAMBDA_HOSTNAME}${inUrl.pathname}${inUrl.search}`

    const upstream = new Request(upstreamUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual',
    })
    upstream.headers.delete('host')
    upstream.headers.set('x-forwarded-host', inUrl.hostname)

    const response = await fetch(upstream)
    const headers = new Headers(response.headers)
    const remapped = headers.get('x-amzn-remapped-www-authenticate')
    if (remapped) {
      headers.set('www-authenticate', remapped)
      headers.delete('x-amzn-remapped-www-authenticate')
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
