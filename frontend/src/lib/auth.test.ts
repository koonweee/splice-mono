import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authStorage,
  buildGoogleOAuthStartUrl,
  getSafeRelativeRedirect,
  validateSession,
} from './auth'

const mocks = vi.hoisted(() => ({
  resolveApiBaseUrl: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('../api/axios', () => ({
  resolveApiBaseUrl: mocks.resolveApiBaseUrl,
}))

vi.mock('../api/clients/spliceAPI', () => ({
  useUserControllerLogout: vi.fn(),
  useUserControllerLogoutAll: vi.fn(),
}))
function createLocalStorageMock() {
  let store: Record<string, string> = {}

  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
}

describe('auth helpers', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: createLocalStorageMock(),
      writable: true,
    })
    window.localStorage.clear()
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.resolveApiBaseUrl.mockReturnValue('http://localhost:3000')
    mocks.fetch.mockReset()
  })

  afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('builds a Google OAuth start URL with an encoded safe redirect', () => {
    const startUrl = buildGoogleOAuthStartUrl('/accounts?tab=plaid#item')

    expect(startUrl).toBe(
      'http://localhost:3000/user/oauth/google/start?redirect=%2Faccounts%3Ftab%3Dplaid%23item',
    )
  })

  it('falls back when the redirect is unsafe', () => {
    expect(getSafeRelativeRedirect('https://evil.example/home')).toBe('/home')
    expect(getSafeRelativeRedirect('//evil.example/home')).toBe('/home')
    expect(getSafeRelativeRedirect('/\\evil.example/home')).toBe('/home')
    expect(getSafeRelativeRedirect('accounts')).toBe('/home')
  })

  it('marks auth only after session validation succeeds', async () => {
    mocks.fetch.mockResolvedValue({ ok: true })

    await expect(validateSession()).resolves.toBe(true)

    expect(mocks.fetch).toHaveBeenCalledWith(
      new URL('/user/me', 'http://localhost:3000'),
      { credentials: 'include' },
    )
    expect(authStorage.isAuthenticated()).toBe(true)
  })

  it('clears auth when session validation fails', async () => {
    authStorage.setAuthenticated()
    mocks.fetch.mockResolvedValue({ ok: false })

    await expect(validateSession()).resolves.toBe(false)

    expect(authStorage.isAuthenticated()).toBe(false)
  })
})
