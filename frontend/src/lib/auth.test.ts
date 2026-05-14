import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authStorage,
  buildGoogleOAuthStartUrl,
  getSafeRelativeRedirect,
  useLogout,
  useLogoutAll,
  validateSession,
} from './auth'

const mocks = vi.hoisted(() => ({
  resolveApiBaseUrl: vi.fn(),
  fetch: vi.fn(),
  revokeCurrentDevicePushSubscription: vi.fn(),
  revokeAllPushSubscriptions: vi.fn(),
  useNavigate: vi.fn(),
  useUserControllerLogout: vi.fn(),
  useUserControllerLogoutAll: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: mocks.useNavigate,
}))

vi.mock('../api/axios', () => ({
  resolveApiBaseUrl: mocks.resolveApiBaseUrl,
}))

vi.mock('../api/clients/spliceAPI', () => ({
  useUserControllerLogout: mocks.useUserControllerLogout,
  useUserControllerLogoutAll: mocks.useUserControllerLogoutAll,
}))

vi.mock('./notifications/browser-push', () => ({
  revokeCurrentDevicePushSubscription:
    mocks.revokeCurrentDevicePushSubscription,
  revokeAllPushSubscriptions: mocks.revokeAllPushSubscriptions,
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
    mocks.useNavigate.mockReturnValue(vi.fn())
    mocks.useUserControllerLogout.mockReturnValue({ mutate: vi.fn() })
    mocks.useUserControllerLogoutAll.mockReturnValue({ mutate: vi.fn() })
    mocks.revokeCurrentDevicePushSubscription.mockResolvedValue(undefined)
    mocks.revokeAllPushSubscriptions.mockResolvedValue(undefined)
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

  it('attempts current-device notification cleanup before logout', async () => {
    useLogout()

    const options = mocks.useUserControllerLogout.mock.calls[0][0] as {
      mutation: { onMutate: () => Promise<void> }
    }

    await options.mutation.onMutate()

    expect(mocks.revokeCurrentDevicePushSubscription).toHaveBeenCalledTimes(1)
  })

  it('attempts all-device notification cleanup before logout-all', async () => {
    useLogoutAll()

    const options = mocks.useUserControllerLogoutAll.mock.calls[0][0] as {
      mutation: { onMutate: () => Promise<void> }
    }

    await options.mutation.onMutate()

    expect(mocks.revokeAllPushSubscriptions).toHaveBeenCalledTimes(1)
  })
})
