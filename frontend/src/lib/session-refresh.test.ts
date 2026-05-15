import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('refreshSession', () => {
  let localStorageStore: Record<string, string>

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'))
    vi.stubGlobal('fetch', mocks.fetch)
    localStorageStore = {}
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          localStorageStore[key] = value
        }),
        removeItem: vi.fn((key: string) => {
          delete localStorageStore[key]
        }),
        clear: vi.fn(() => {
          localStorageStore = {}
        }),
      },
      writable: true,
    })
    mocks.fetch.mockReset()
    mocks.resolveApiBaseUrl.mockReturnValue('http://localhost:3000')
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'locks')
    vi.resetModules()
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('coalesces concurrent refreshes in the current tab', async () => {
    const { refreshSession } = await import('./session-refresh')
    mocks.fetch.mockResolvedValue({ ok: true })

    await Promise.all([refreshSession(), refreshSession()])

    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('uses navigator locks when available', async () => {
    const lockRequest = vi.fn(
      async (
        _name: string,
        _options: { mode: 'exclusive' },
        callback: () => Promise<void>,
      ) => callback(),
    )
    Object.defineProperty(navigator, 'locks', {
      value: { request: lockRequest },
      configurable: true,
    })
    const { refreshSession } = await import('./session-refresh')
    mocks.fetch.mockResolvedValue({ ok: true })

    await refreshSession()

    expect(lockRequest).toHaveBeenCalledWith(
      'splice-refresh-token',
      { mode: 'exclusive' },
      expect.any(Function),
    )
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('skips refresh when another tab already completed one after this request started', async () => {
    const { refreshSession } = await import('./session-refresh')
    const startedAt = Date.now()
    window.localStorage.setItem('splice_refresh_success_at', String(startedAt + 1))

    await refreshSession()

    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('classifies missing refresh cookies as confirmed logged out', async () => {
    const { ConfirmedLoggedOutError, refreshSession } = await import(
      './session-refresh'
    )
    mocks.fetch.mockResolvedValue({ ok: false, status: 400 })

    await expect(refreshSession()).rejects.toBeInstanceOf(
      ConfirmedLoggedOutError,
    )
  })

  it('classifies refresh server failures as transient', async () => {
    const { TransientAuthError, refreshSession } = await import(
      './session-refresh'
    )
    mocks.fetch.mockResolvedValue({ ok: false, status: 503 })

    await expect(refreshSession()).rejects.toBeInstanceOf(TransientAuthError)
  })
})
