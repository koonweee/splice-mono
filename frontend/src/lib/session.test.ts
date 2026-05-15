import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureSession, sessionQueryOptions } from './session'
import {
  ConfirmedLoggedOutError,
  TransientAuthError,
} from './session-refresh'

const mocks = vi.hoisted(() => ({
  resolveApiBaseUrl: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('./api-base-url', () => ({
  resolveApiBaseUrl: mocks.resolveApiBaseUrl,
  resolveApiUrl: (path: string) => {
    const apiBaseUrl = mocks.resolveApiBaseUrl()
    return apiBaseUrl ? new URL(path, apiBaseUrl) : path
  },
}))

describe('session helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockReset()
    mocks.resolveApiBaseUrl.mockReturnValue('http://localhost:3000')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('returns the current user when /user/me succeeds', async () => {
    const user = { id: 'user-1', email: 'user@example.com' }
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(user),
    })

    await expect(ensureSession()).resolves.toEqual({ user })

    expect(mocks.fetch).toHaveBeenCalledWith(
      new URL('/user/me', 'http://localhost:3000'),
      { credentials: 'include' },
    )
  })

  it('refreshes and retries /user/me after an expired access cookie', async () => {
    const user = { id: 'user-1', email: 'user@example.com' }
    mocks.fetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(user),
      })

    await expect(ensureSession()).resolves.toEqual({ user })

    expect(mocks.fetch).toHaveBeenNthCalledWith(
      2,
      new URL('/user/refresh', 'http://localhost:3000'),
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    )
  })

  it('reports confirmed logged-out after refresh auth failure', async () => {
    mocks.fetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: false, status: 401 })

    await expect(ensureSession()).rejects.toBeInstanceOf(
      ConfirmedLoggedOutError,
    )
  })

  it('treats refresh server failure as transient', async () => {
    mocks.fetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: false, status: 503 })

    await expect(ensureSession()).rejects.toBeInstanceOf(TransientAuthError)
  })

  it('does not retry confirmed logged-out query failures', () => {
    const options = sessionQueryOptions()
    const retry = options.retry

    expect(typeof retry).toBe('function')
    expect(
      typeof retry === 'function'
        ? retry(0, new ConfirmedLoggedOutError())
        : true,
    ).toBe(false)
  })
})
