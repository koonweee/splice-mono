import { createMiddleware, createStart } from '@tanstack/react-start'

const requestIsolation = createMiddleware().server(
  async ({ next, request }) => {
    const { createServerApiClient, withServerApiClient } =
      await import('./lib/server/api-client.server')
    const { getResponseHeaders, setResponseHeader } =
      await import('@tanstack/react-start/server')
    setResponseHeader('Cache-Control', 'private, no-store')
    const client = createServerApiClient({
      cookieHeader: request.headers.get('cookie') ?? '',
      baseUrl:
        process.env.SPLICE_INTERNAL_API_BASE_URL ?? 'http://localhost:3000',
      signal: request.signal,
      onSetCookie: (cookies) => {
        for (const cookie of cookies)
          getResponseHeaders().append('Set-Cookie', cookie)
      },
    })
    return withServerApiClient(client, () => next())
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [requestIsolation],
}))
