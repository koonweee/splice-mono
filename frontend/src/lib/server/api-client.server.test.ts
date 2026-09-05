// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ConfirmedLoggedOutError, TransientAuthError } from '../session-refresh'
import {
  createServerApiClient,
  getServerApiClient,
  withServerApiClient,
} from './api-client.server'

const baseUrl = 'http://api.internal:3000'
const json = (value: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(value, { status, headers })

describe('request-isolated server API', () => {
  it('isolates concurrent requests and forwards only session cookies', async () => {
    const fetcher = vi.fn(
      async (_url: URL | RequestInfo, options?: RequestInit) => {
        await Promise.resolve()
        return json({ cookie: new Headers(options?.headers).get('cookie') })
      },
    ) as typeof fetch
    const client = (id: string) =>
      createServerApiClient({
        baseUrl,
        cookieHeader: `tracking=secret; splice_access_token=${id}`,
        fetcher,
        onSetCookie: vi.fn(),
      })
    const [a, b] = await Promise.all(
      ['alice', 'bob'].map((id) =>
        withServerApiClient(client(id), async () => {
          await Promise.resolve()
          return getServerApiClient().request({ url: '/user/me' })
        }),
      ),
    )
    expect(a).toEqual({ cookie: 'splice_access_token=alice' })
    expect(b).toEqual({ cookie: 'splice_access_token=bob' })
    expect(() => getServerApiClient()).toThrow('outside request middleware')
  })

  it('coordinates one refresh, preserves separate cookies, and retries with the updated jar', async () => {
    const setCookies = vi.fn()
    const fetcher = vi.fn(
      async (input: URL | RequestInfo, options?: RequestInit) => {
        const path = new URL(String(input)).pathname
        if (path === '/user/refresh') {
          const headers = new Headers()
          headers.append(
            'Set-Cookie',
            'splice_access_token=new; HttpOnly; Path=/; SameSite=Lax',
          )
          headers.append(
            'Set-Cookie',
            'splice_refresh_token=rotated; HttpOnly; Path=/; Expires=Wed, 01 Jan 2031 00:00:00 GMT',
          )
          return json(
            { accessToken: 'NEVER_SERIALIZE', refreshToken: 'NEVER_SERIALIZE' },
            200,
            headers,
          )
        }
        return new Headers(options?.headers)
          .get('cookie')
          ?.includes('splice_access_token=new')
          ? json({ id: 'alice' })
          : json({}, 401)
      },
    ) as typeof fetch
    const client = createServerApiClient({
      baseUrl,
      cookieHeader: 'splice_access_token=old; splice_refresh_token=old',
      fetcher,
      onSetCookie: setCookies,
    })
    const results = await Promise.all([
      client.request({ url: '/user/me' }),
      client.request({ url: '/account' }),
    ])
    expect(results).toEqual([{ id: 'alice' }, { id: 'alice' }])
    expect(
      vi
        .mocked(fetcher)
        .mock.calls.filter(([url]) => String(url).endsWith('/user/refresh')),
    ).toHaveLength(1)
    expect(setCookies.mock.calls[0][0]).toEqual([
      'splice_access_token=new; HttpOnly; Path=/; SameSite=Lax',
      'splice_refresh_token=rotated; HttpOnly; Path=/; Expires=Wed, 01 Jan 2031 00:00:00 GMT',
    ])
    expect(JSON.stringify(results)).not.toContain('NEVER_SERIALIZE')
  })

  it('never authorizes missing credentials and distinguishes rejected auth from downtime', async () => {
    const fetcher = vi.fn()
    const empty = createServerApiClient({
      baseUrl,
      fetcher,
      onSetCookie: vi.fn(),
    })
    await expect(empty.request({ url: '/user/me' })).rejects.toBeInstanceOf(
      ConfirmedLoggedOutError,
    )
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockResolvedValue(json({}, 503))
    const unavailable = createServerApiClient({
      baseUrl,
      cookieHeader: 'splice_access_token=old',
      fetcher,
      onSetCookie: vi.fn(),
    })
    await expect(
      unavailable.request({ url: '/user/me' }),
    ).rejects.toBeInstanceOf(TransientAuthError)
    fetcher.mockResolvedValue(json({}, 401))
    await expect(
      unavailable.request({ url: '/user/me' }),
    ).rejects.toBeInstanceOf(ConfirmedLoggedOutError)
  })

  it('rejects foreign destinations before leaking cookies and propagates cancellation', async () => {
    const fetcher = vi.fn(
      async (_url: URL | RequestInfo, options?: RequestInit) => {
        expect(options?.signal?.aborted).toBe(true)
        throw new DOMException('Aborted', 'AbortError')
      },
    ) as typeof fetch
    const controller = new AbortController()
    controller.abort()
    const client = createServerApiClient({
      baseUrl,
      cookieHeader: 'splice_access_token=alice',
      signal: controller.signal,
      fetcher,
      onSetCookie: vi.fn(),
    })
    await expect(
      client.request({ url: 'https://evil.example/' }),
    ).rejects.toThrow('Untrusted')
    expect(fetcher).not.toHaveBeenCalled()
    await expect(client.request({ url: '/user/me' })).rejects.toBeInstanceOf(
      TransientAuthError,
    )
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
