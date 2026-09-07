import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountMetadataMutation } from '../hooks/useAccountMetadataMutation'
import { clearPrivateCaches } from './auth-generation'
import { useLogout, useLogoutAll } from './auth'
import { clearPendingLogout } from './pwa/logout-state'
import { createMutationCache } from './query-invalidation'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  navigate: vi.fn(),
  cleanupDevice: vi.fn(),
  cleanupAll: vi.fn(),
  badge: vi.fn(),
  worker: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('../api/axios', () => ({ axios: mocks.request }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('./notifications/browser-push', () => ({
  revokeCurrentDevicePushSubscription: mocks.cleanupDevice,
  revokeAllPushSubscriptions: mocks.cleanupAll,
}))
vi.mock('./pwa/app-badge', () => ({ clearAppBadge: mocks.badge }))
vi.mock('./pwa/worker-channel', () => ({ disableWorkerSession: mocks.worker }))
beforeEach(() => {
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.worker.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  clearPendingLogout()
})

function useCurrentLogoutAction() {
  const mutation = useLogout()
  return () => mutation.mutateAsync({ data: {} })
}
function useAllLogoutAction() {
  const mutation = useLogoutAll()
  return () => mutation.mutateAsync()
}

describe('logout with the real global mutation lifecycle', () => {
  it.each([
    {
      useAction: useCurrentLogoutAction,
      path: '/user/logout',
      cleanup: mocks.cleanupDevice,
    },
    {
      useAction: useAllLogoutAction,
      path: '/user/logout-all',
      cleanup: mocks.cleanupAll,
    },
  ])(
    'executes $path after cleanup clears the private cache',
    async ({ useAction, path, cleanup: revoke }) => {
      const events: Array<string> = []
      revoke.mockImplementation(() => {
        events.push('push cleanup')
        return Promise.resolve()
      })
      mocks.badge.mockResolvedValue(undefined)
      mocks.fetch.mockImplementation(() => {
        events.push('logout API')
        return Promise.resolve(new Response(null, { status: 204 }))
      })
      const client: QueryClient = new QueryClient({
        mutationCache: createMutationCache(() => client),
      })
      client.setQueryData(['/account'], [{ id: 'private account' }])
      const { result } = renderHook(() => useAction(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      })
      await act(async () => {
        await result.current()
      })
      expect(events).toEqual(['push cleanup', 'logout API'])
      expect(String(mocks.fetch.mock.calls[0][0])).toContain(path)
      expect(mocks.fetch.mock.calls[0][1]).toMatchObject({
        method: 'POST',
        credentials: 'include',
      })
      expect(client.getQueryData(['/account'])).toBeUndefined()
      expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' })
      client.clear()
    },
  )
  it('dispatches logout while every optional cleanup stalls or rejects', async () => {
    mocks.cleanupDevice.mockImplementation(() => new Promise<void>(() => {}))
    mocks.worker.mockRejectedValueOnce(new Error('worker unavailable'))
    mocks.badge.mockRejectedValueOnce(new Error('badge unavailable'))
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client: QueryClient = new QueryClient({
      mutationCache: createMutationCache(() => client),
    })
    client.setQueryData(['/account'], [{ id: 'private' }])
    const { result } = renderHook(() => useCurrentLogoutAction(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    })
    await act(async () => {
      await result.current()
    })
    expect(String(mocks.fetch.mock.calls[0][0])).toContain('/user/logout')
    expect(mocks.fetch.mock.calls[0][1]).toMatchObject({ method: 'POST' })
    expect(client.getQueryData(['/account'])).toBeUndefined()
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' })
    client.clear()
  })

  it('rejects writes from an old mounted account editor even after hook options rerender', async () => {
    const client: QueryClient = new QueryClient({
      mutationCache: createMutationCache(() => client),
    })
    const { result, rerender } = renderHook(
      () => useAccountMetadataMutation('account-a'),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    )
    clearPrivateCaches(false)
    rerender()
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          id: 'account-a',
          data: { notes: 'Old identity' },
        }),
      ).rejects.toMatchObject({ name: 'AbortError' })
    })
    expect(mocks.request).not.toHaveBeenCalled()
    client.clear()
  })
})
