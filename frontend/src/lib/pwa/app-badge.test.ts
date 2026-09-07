import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyNotificationSummaryBadge, clearAppBadge } from './app-badge'

const mocks = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('./worker-channel', () => ({ sendWorkerBadge: mocks.send }))
afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('app badge routing', () => {
  it.each([12, 0])(
    'sends authoritative count %s and snapshot timestamp through the worker without a window writer',
    async (count) => {
      const set = vi.fn()
      const clear = vi.fn()
      vi.stubGlobal('navigator', { setAppBadge: set, clearAppBadge: clear })
      mocks.send.mockResolvedValue(undefined)
      await applyNotificationSummaryBadge({
        uncategorizedTransactionCount: count,
        unreadNotificationCount: 2,
        computedAt: '2026-09-07T12:00:00.000Z',
      })
      expect(mocks.send).toHaveBeenCalledWith(count, '2026-09-07T12:00:00.000Z')
      expect(set).not.toHaveBeenCalled()
      expect(clear).not.toHaveBeenCalled()
    },
  )
  it('ignores invalid or missing snapshots instead of replacing the badge with zero', async () => {
    await applyNotificationSummaryBadge({
      uncategorizedTransactionCount: -1,
      unreadNotificationCount: 0,
      computedAt: 'bad',
    })
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('clears locally on logout without waiting for registration or changing worker ownership', async () => {
    const clear = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clearAppBadge: clear })
    await clearAppBadge()
    expect(clear).toHaveBeenCalledOnce()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('tolerates unsupported local badging and bounds a stalled clear call', async () => {
    vi.stubGlobal('navigator', {})
    await expect(clearAppBadge()).resolves.toBeUndefined()
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { clearAppBadge: () => new Promise(() => {}) })
    const failure = expect(clearAppBadge()).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(3_000)
    await failure
  })
})
