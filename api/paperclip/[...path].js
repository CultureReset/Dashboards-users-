// Forwards /api/paperclip/* to the Paperclip server in PAPERCLIP_SERVER_URL.

export const config = { runtime: 'edge' }

const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length']

export default async function handler(request) {
  const server = (process.env.PAPERCLIP_SERVER_URL || '').replace(/\/+$/, '')
  if (!server) {
    return Response.json({ error: 'PAPERCLIP_SERVER_URL is not set for this deployment' }, { status: 503 })
  }

  const incoming = new URL(request.url)
  const rest = incoming.pathname.replace(/^\/api\/paperclip/, '') || '/'
  const target = `${server}/api${rest}${incoming.search}`

  const headers = new Headers(request.headers)
  for (const name of HOP_BY_HOP) headers.delete(name)
  headers.set('x-forwarded-host', incoming.host)
  headers.set('x-forwarded-proto', incoming.protocol.replace(':', ''))

  const hasBody = !['GET', 'HEAD'].includes(request.method)
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    duplex: hasBody ? 'half' : undefined,
    redirect: 'manual',
  })

  const out = new Headers(upstream.headers)
  out.delete('content-encoding')
  out.delete('content-length')
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out })
}
