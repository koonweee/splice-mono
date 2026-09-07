import { createHash } from 'node:crypto'
import { defineHandler } from 'h3'
import { createServerApiClient } from '../../../src/lib/server/api-client.server'
import { isConfirmedLoggedOutError } from '../../../src/lib/session-refresh'

export default defineHandler(async (event) => {
  const cookies: Array<string> = []
  const client = createServerApiClient({
    cookieHeader: event.req.headers.get('cookie') ?? '',
    baseUrl:
      process.env.SPLICE_INTERNAL_API_BASE_URL ?? 'http://localhost:3000',
    signal: AbortSignal.timeout(5_000),
    onSetCookie: (values) => cookies.push(...values),
  })
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/json',
  })
  try {
    const user = await client.request<{ id?: unknown }>({ url: '/user/me' })
    if (typeof user.id !== 'string' || !user.id)
      throw new Error('Invalid session response')
    for (const cookie of cookies) headers.append('Set-Cookie', cookie)
    const controlScope = createHash('sha256')
      .update(`splice:pwa-control:v1:${user.id}`)
      .digest('hex')
    return new Response(
      JSON.stringify({ app: 'splice', status: 'ready', controlScope }),
      {
        headers,
      },
    )
  } catch (error) {
    if (isConfirmedLoggedOutError(error)) {
      for (const cookie of cookies) headers.append('Set-Cookie', cookie)
      return new Response(JSON.stringify({ app: 'splice', status: 'login' }), {
        headers,
      })
    }
    return new Response(
      JSON.stringify({ app: 'splice', status: 'unavailable' }),
      { status: 503, headers },
    )
  }
})
