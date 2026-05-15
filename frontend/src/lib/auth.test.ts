import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildGoogleOAuthStartUrl,
  clearSessionCache,
  getSafeRelativeRedirect,
  useLogout,
  useLogoutAll,
} from './auth'
import { sessionQueryKey } from './session'

const mocks = vi.hoisted(() => ({
  resolveApiBaseUrl: vi.fn(),
  queryClient: {
    removeQueries: vi.fn(),
    invalidateQueries: vi.fn(),
  },
  revokeCurrentDevicePushSubscription: vi.fn(),
  revokeAllPushSubscriptions: vi.fn(),
  useNavigate: vi.fn(),
  useUserControllerLogout: vi.fn(),
  useUserControllerLogoutAll: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: mocks.useNavigate,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
}))

vi.mock('./api-base-url', () => ({
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

describe('auth helpers', () => {
  beforeEach(() => {
    mocks.resolveApiBaseUrl.mockReturnValue('http://localhost:3000')
    mocks.useNavigate.mockReturnValue(vi.fn())
    mocks.useUserControllerLogout.mockReturnValue({ mutate: vi.fn() })
    mocks.useUserControllerLogoutAll.mockReturnValue({ mutate: vi.fn() })
    mocks.revokeCurrentDevicePushSubscription.mockResolvedValue(undefined)
    mocks.revokeAllPushSubscriptions.mockResolvedValue(undefined)
    mocks.queryClient.removeQueries.mockReset()
    mocks.queryClient.invalidateQueries.mockReset()
  })

  afterEach(() => {
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

  it('removes the session query from cache', () => {
    clearSessionCache(mocks.queryClient)

    expect(mocks.queryClient.removeQueries).toHaveBeenCalledWith({
      queryKey: sessionQueryKey,
    })
  })

  it('attempts current-device notification cleanup before logout', async () => {
    useLogout()

    const options = mocks.useUserControllerLogout.mock.calls[0][0] as {
      mutation: { onMutate: () => Promise<void> }
    }

    await options.mutation.onMutate()

    expect(mocks.revokeCurrentDevicePushSubscription).toHaveBeenCalledTimes(1)
  })

  it('clears cached session after logout succeeds', () => {
    useLogout()

    const navigate = mocks.useNavigate.mock.results[0].value as ReturnType<
      typeof vi.fn
    >
    const options = mocks.useUserControllerLogout.mock.calls[0][0] as {
      mutation: { onSuccess: () => void }
    }

    options.mutation.onSuccess()

    expect(mocks.queryClient.removeQueries).toHaveBeenCalledWith({
      queryKey: sessionQueryKey,
    })
    expect(navigate).toHaveBeenCalledWith({ to: '/' })
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
