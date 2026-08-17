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
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  },
}
