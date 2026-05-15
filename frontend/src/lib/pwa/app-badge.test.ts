import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearAppBadge,
  fetchUncategorizedTransactionCount,
  isAppBadgeSupported,
  refreshUncategorizedTransactionBadge,
  setAppBadgeCount,
} from './app-badge'

const mocks = vi.hoisted(() => ({
  axios: vi.fn(),
}))

vi.mock('../../api/axios', () => ({
  axios: mocks.axios,
}))

describe('app badge helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('no-ops when the Badging API is unavailable', async () => {
    Object.defineProperty(navigator, 'setAppBadge', {
      value: undefined,
      configurable: true,
    })
    Object.defineProperty(navigator, 'clearAppBadge', {
      value: undefined,
      configurable: true,
    })

    expect(isAppBadgeSupported()).toBe(false)
    await expect(setAppBadgeCount(4)).resolves.toBeUndefined()
  })

  it('sets and clears supported app badges', async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined)
    const clearBadge = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'setAppBadge', {
      value: setAppBadge,
      configurable: true,
    })
    Object.defineProperty(navigator, 'clearAppBadge', {
      value: clearBadge,
      configurable: true,
    })

    expect(isAppBadgeSupported()).toBe(true)

    await setAppBadgeCount(7)
    await clearAppBadge()

    expect(setAppBadge).toHaveBeenCalledWith(7)
    expect(clearBadge).toHaveBeenCalledTimes(1)
  })

  it('fetches the uncategorized transaction total', async () => {
    mocks.axios.mockResolvedValueOnce({
      data: [],
      total: 12,
      pageIndex: 0,
      pageSize: 1,
    })

    await expect(fetchUncategorizedTransactionCount()).resolves.toBe(12)

    expect(mocks.axios).toHaveBeenCalledWith({
      url: '/transaction',
      method: 'GET',
      params: {
        categoryId: 'UNCATEGORIZED',
        pageIndex: '0',
        pageSize: '1',
        sortBy: 'activityDate',
        sortOrder: 'DESC',
      },
    })
  })

  it('refreshes the browser badge from the uncategorized total', async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'setAppBadge', {
      value: setAppBadge,
      configurable: true,
    })
    Object.defineProperty(navigator, 'clearAppBadge', {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
    })
    mocks.axios.mockResolvedValueOnce({
      data: [],
      total: 5,
      pageIndex: 0,
      pageSize: 1,
    })

    await expect(refreshUncategorizedTransactionBadge()).resolves.toBe(5)

    expect(setAppBadge).toHaveBeenCalledWith(5)
  })
})
