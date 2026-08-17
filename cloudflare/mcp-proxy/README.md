# financy-mcp-proxy

Cloudflare Worker that fronts the remote MCP server with the public
`mcp[-stg].open-finance.ai` domain. It rewrites the upstream `Host` header
(Lambda Function URLs only accept their own hostname) and sets
`x-forwarded-host` so the server builds its `WWW-Authenticate:
resource_metadata` hint on the public domain.

## Deploy — staging (`mcp-stg.open-finance.ai`)

```sh
cd cloudflare/mcp-proxy
npx wrangler login        # once
npx wrangler deploy
npx wrangler secret put LAMBDA_HOSTNAME
```

## Deploy — production (`mcp.open-finance.ai`)

```sh
npx wrangler deploy --env production
npx wrangler secret put LAMBDA_HOSTNAME --env production
```

## Verify

```sh
curl https://mcp-stg.open-finance.ai/.well-known/oauth-protected-resource
```
