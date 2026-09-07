import { defineHandler } from 'h3'
import { createServerApiClient } from '../../../src/lib/server/api-client.server'

export default defineHandler(async (event) => {
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/json',
  })
  try {
    const input: unknown = await event.req.json()
    if (
      !input ||
      typeof input !== 'object' ||
      !('enrollmentId' in input) ||
      typeof input.enrollmentId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(input.enrollmentId)
    )
      return new Response(JSON.stringify({ eligible: false }), {
        status: 400,
        headers,
      })
    const client = createServerApiClient({
      cookieHeader: event.req.headers.get('cookie') ?? '',
      baseUrl:
        process.env.SPLICE_INTERNAL_API_BASE_URL ?? 'http://localhost:3000',
      signal: AbortSignal.timeout(4_000),
      onSetCookie: (cookies) => {
        for (const cookie of cookies) headers.append('Set-Cookie', cookie)
      },
    })
    const result = await client.request<{ eligible: boolean }>({
      url: `/notification/push/enrollment/${input.enrollmentId}`,
    })
    return new Response(
      JSON.stringify({ eligible: result.eligible === true }),
      { headers },
    )
  } catch {
    return new Response(JSON.stringify({ eligible: false }), { headers })
  }
})
