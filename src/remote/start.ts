import { startRemoteServer } from './server.js'

const port = Number(process.env.PORT ?? 8790)

startRemoteServer(process.env, port).then((server) => {
  const address = server.address()
  const shown = typeof address === 'object' && address ? address.port : port
  console.error(`financy remote MCP server listening on :${shown}`)
})
