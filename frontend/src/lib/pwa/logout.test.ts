import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingLogout } from './logout-state'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  clear: vi.fn(),
  clearSnapshot: vi.fn(),
  current: null as PendingLogout | null,
}))
vi.mock('./home-snapshot', () => ({ clearHomeSnapshot: mocks.clearSnapshot }))
vi.mock('./deadline', () => ({ fetchWithDeadline: mocks.request }))
vi.mock('./logout-state', () => ({
  getPendingLogout: () => mocks.current,
  clearPendingLogout: mocks.clear,
}))
vi.mock('../api-base-url', () => ({ resolveApiUrl: (path: string) => path }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.clearSnapshot.mockResolvedValue(true)
  mocks.current = { id: 'device-a', mode: 'device' }
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('server-authoritative pending logout', () => {
  it('sends cookie-backed logout without the blocked identity interceptor', async () => {
    mocks.request.mockResolvedValue(new Response(null, { status: 204 }))
    const { completePendingLogout } = await import('./logout')
    await expect(completePendingLogout()).resolves.toBe(true)
    expect(mocks.request).toHaveBeenCalledWith(
      '/user/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      }),
    )
    expect(mocks.clear).toHaveBeenCalledWith('device-a')
  })
  it('retains the marker on network/server failure and retries later', async () => {
    mocks.request
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { completePendingLogout } = await import('./logout')
    await expect(completePendingLogout()).rejects.toThrow('offline')
    await expect(completePendingLogout()).rejects.toThrow('Sign out')
    expect(mocks.clear).not.toHaveBeenCalled()
    await expect(completePendingLogout()).resolves.toBe(true)
    expect(mocks.clear).toHaveBeenCalledOnce()
  })
  it('retains logout eligibility until durable local cleanup is acknowledged', async () => {
    mocks.request.mockResolvedValue(new Response(null, { status: 204 }))
    mocks.clearSnapshot.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { completePendingLogout } = await import('./logout')
    await expect(completePendingLogout()).rejects.toThrow(
      'Saved data could not be cleared',
    )
    expect(mocks.clear).not.toHaveBeenCalled()
    await expect(completePendingLogout()).resolves.toBe(true)
    expect(mocks.clear).toHaveBeenCalledWith('device-a')
  })
  it('refreshes expired access credentials for logout-all before retrying', async () => {
    mocks.current = { id: 'all-a', mode: 'all' }
    mocks.request
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { completePendingLogout } = await import('./logout')
    await expect(completePendingLogout()).resolves.toBe(true)
    expect(mocks.request.mock.calls.map(([path]) => path)).toEqual([
      '/user/logout-all',
      '/user/refresh',
      '/user/logout-all',
    ])
    expect(mocks.clear).toHaveBeenCalledWith('all-a')
  })
  it('does not treat an older device logout as completing a newer logout-all', async () => {
    let release!: (response: Response) => void
    mocks.request
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve
          }),
      )
      .mockResolvedValue(new Response(null, { status: 204 }))
    const { completePendingLogout } = await import('./logout')
    const device = completePendingLogout({ id: 'device-a', mode: 'device' })
    mocks.current = { id: 'all-b', mode: 'all' }
    const all = completePendingLogout(mocks.current)
    release(new Response(null, { status: 204 }))
    await Promise.all([device, all])
    expect(mocks.request.mock.calls.map(([path]) => path)).toContain(
      '/user/logout-all',
    )
    expect(mocks.clear).toHaveBeenCalledWith('all-b')
  })
})
