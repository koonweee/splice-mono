// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimePeriod } from '../types'
import {
  HOME_SNAPSHOT_MAX_AGE,
  clearHomeSnapshot,
  getHomeSnapshotEpoch,
  isHomeSnapshot,
  readHomeSnapshot,
  saveHomeSnapshot,
  setHomeSnapshotIdentity,
} from './home-snapshot'
import type { HomeSnapshot } from './home-snapshot'

function snapshot(): HomeSnapshot {
  const now = Date.now()
  return {
    schemaVersion: 1,
    identity: 'test-user',
    authEpoch: getHomeSnapshotEpoch()!,
    savedAt: now,
    period: TimePeriod.month,
    endDate: '2026-09-08',
    presentation: {
      currency: 'USD',
      timezone: 'America/Los_Angeles',
      appearance: { mode: 'dark', accent: null },
      maskBalances: true,
      hideZeroBalanceAccounts: false,
    },
    summary: {
      updatedAt: now - 1000,
      data: {
        period: 'month',
        startDate: '2026-08-08',
        endDate: '2026-09-08',
        reportingCurrency: 'USD',
        generatedAt: '2026-09-08T10:00:00Z',
        netWorth: { money: { amount: '0', currency: 'USD' }, sign: 'positive' },
        changeAmount: {
          money: { amount: '0', currency: 'USD' },
          sign: 'positive',
        },
        assets: [],
        liabilities: [],
      },
    },
    series: null,
  }
}
beforeEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
  })
  document.cookie = 'splice_snapshot_blocked=; Max-Age=0; Path=/'
  document.cookie = 'splice_logout_pending=; Max-Age=0; Path=/'
})

describe('Home snapshot validation', () => {
  it('accepts an empty Home and preserves masking and original timestamps', () => {
    const value = snapshot()
    expect(isHomeSnapshot(value)).toBe(true)
    expect(value.presentation.maskBalances).toBe(true)
    expect(value.summary.updatedAt).toBeLessThan(value.savedAt)
  })
  it('accepts valid series with independent freshness', () => {
    const value = snapshot()
    value.series = {
      updatedAt: value.savedAt - 2000,
      data: {
        period: 'month',
        startDate: '2026-08-08',
        endDate: value.endDate,
        reportingCurrency: 'USD',
        generatedAt: '2026-09-08T10:00:00Z',
        points: [
          { date: value.endDate, netWorth: value.summary.data.netWorth },
        ],
      },
    }
    expect(isHomeSnapshot(value)).toBe(true)
    value.series.data.endDate = '2026-09-07'
    expect(isHomeSnapshot(value)).toBe(false)
  })
  it.each([
    (s: HomeSnapshot) => {
      s.savedAt -= HOME_SNAPSHOT_MAX_AGE + 1
    },
    (s: HomeSnapshot) => {
      s.summary.updatedAt = s.savedAt + 1
    },
    (s: HomeSnapshot) => {
      s.endDate = '2026-02-30'
    },
    (s: HomeSnapshot) => {
      s.summary.data.period = 'day'
    },
    (s: HomeSnapshot) => {
      s.summary.data.reportingCurrency = 'EUR'
    },
    (s: HomeSnapshot) => {
      s.summary.data.netWorth.money.amount = '-12'
    },
    (s: HomeSnapshot) => {
      s.summary.data.changePercent = NaN
    },
    (s: HomeSnapshot) => {
      s.presentation.timezone = 'unknown-zone'
    },
    (s: HomeSnapshot) => {
      Object.assign(s, { user: { accessToken: 'never-store' } })
    },
    (s: HomeSnapshot) => {
      Object.assign(s.summary.data, { secret: 'never-store' })
    },
    (s: HomeSnapshot) => {
      Object.assign(s.summary.data, { assets: [{}] })
    },
  ])('rejects unsafe, corrupt, expired, or mismatched data %#', (mutate) => {
    const value = snapshot()
    mutate(value)
    expect(isHomeSnapshot(value)).toBe(false)
  })
  it('rejects a serialized snapshot above the size limit', () => {
    const value = snapshot()
    value.summary.data.assets = Array.from({ length: 5000 }, (_, i) => ({
      id: String(i),
      name: 'a'.repeat(512),
      customName: null,
      type: 'investment',
      subType: null,
      valuationMode: 'balance',
      institutionName: null,
      archivedAt: null,
      syncedAt: null,
      effectiveBalance: value.summary.data.netWorth,
    }))
    expect(isHomeSnapshot(value)).toBe(false)
  })
})

describe('durable eligibility', () => {
  it('rotates eligibility immediately on clear and rejects a late write', async () => {
    const value = snapshot()
    clearHomeSnapshot()
    expect(getHomeSnapshotEpoch()).not.toBe(value.authEpoch)
    const open = vi.fn()
    vi.stubGlobal('indexedDB', { open })
    await saveHomeSnapshot(value)
    expect(open).not.toHaveBeenCalled()
  })
  it('retains matching identity and invalidates a different identity', () => {
    setHomeSnapshotIdentity('first')
    const firstEpoch = getHomeSnapshotEpoch()
    setHomeSnapshotIdentity('first')
    expect(getHomeSnapshotEpoch()).toBe(firstEpoch)
    setHomeSnapshotIdentity('second')
    expect(getHomeSnapshotEpoch()).not.toBe(firstEpoch)
  })
  it('does not restore during a pending offline logout', async () => {
    window.localStorage.setItem(
      'splice:pending-logout',
      JSON.stringify({ id: 'logout', mode: 'device' }),
    )
    expect(getHomeSnapshotEpoch()).toBeNull()
    expect(await readHomeSnapshot()).toBeNull()
  })
  it('treats unreadable storage and unavailable IndexedDB as a miss', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(await readHomeSnapshot()).toBeNull()
    vi.restoreAllMocks()
    vi.stubGlobal('indexedDB', undefined)
    expect(await readHomeSnapshot()).toBeNull()
  })
  it('rejects a delayed read when another tab changes the durable epoch', async () => {
    const value = snapshot()
    const request = { result: value, onsuccess: () => {} }
    const transaction = {
      oncomplete: () => {},
      onerror: () => {},
      onabort: () => {},
      objectStore: () => ({ get: () => request }),
    }
    const database = { transaction: () => transaction, close: vi.fn() }
    const open = {
      result: database,
      onsuccess: () => {},
      onblocked: () => {},
      onerror: () => {},
    }
    vi.stubGlobal('indexedDB', { open: () => open })
    const reading = readHomeSnapshot()
    open.onsuccess()
    request.onsuccess()
    window.localStorage.setItem(
      'splice:home-snapshot-epoch',
      'another-tab-logged-out',
    )
    transaction.oncomplete()
    expect(await reading).toBeNull()
    expect(database.close).toHaveBeenCalled()
  })
  it('bounds an IndexedDB open that never completes', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('indexedDB', { open: () => ({}) })
    const reading = readHomeSnapshot()
    await vi.advanceTimersByTimeAsync(500)
    expect(await reading).toBeNull()
    vi.useRealTimers()
  })
})

describe('captured launch snapshot invalidation', () => {
  it('does not clear a newer verified identity when a captured old snapshot mismatches', async () => {
    setHomeSnapshotIdentity('alice')
    const capturedEpoch = getHomeSnapshotEpoch()
    expect(capturedEpoch).toBeTruthy()
    setHomeSnapshotIdentity('bob')
    const verifiedEpoch = getHomeSnapshotEpoch()
    expect(verifiedEpoch).not.toBe(capturedEpoch)
    const open = vi.fn()
    vi.stubGlobal('indexedDB', { open })

    expect(await clearHomeSnapshot(capturedEpoch!)).toBe(true)
    expect(getHomeSnapshotEpoch()).toBe(verifiedEpoch)
    expect(window.localStorage.getItem('splice:home-snapshot-identity')).toBe(
      'bob',
    )
    expect(open).not.toHaveBeenCalled()
  })

  it('still invalidates a mismatched snapshot from the current epoch', async () => {
    setHomeSnapshotIdentity('alice')
    const capturedEpoch = getHomeSnapshotEpoch()
    expect(capturedEpoch).toBeTruthy()
    expect(await clearHomeSnapshot(capturedEpoch!)).toBe(true)
    expect(getHomeSnapshotEpoch()).not.toBe(capturedEpoch)
    expect(
      window.localStorage.getItem('splice:home-snapshot-identity'),
    ).toBeNull()
  })
})

describe('durable cleanup acknowledgment', () => {
  function denyMarkers() {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('')
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {})
  }
  it('does not acknowledge a captured epoch when current durable eligibility is unreadable', async () => {
    denyMarkers()
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.stubGlobal('indexedDB', undefined)
    expect(await clearHomeSnapshot('captured-old-epoch')).toBe(false)
  })
  it('does not acknowledge when epoch, cookie and deletion all fail', async () => {
    denyMarkers()
    vi.stubGlobal('indexedDB', undefined)
    expect(await clearHomeSnapshot()).toBe(false)
  })
  it('acknowledges a verified fallback cookie despite unavailable IndexedDB', async () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    let cookie = ''
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => cookie)
    vi.spyOn(document, 'cookie', 'set').mockImplementation((value) => {
      cookie = value
    })
    vi.stubGlobal('indexedDB', undefined)
    expect(await clearHomeSnapshot()).toBe(true)
  })
  it('waits for committed deletion when both durable marker stores reject writes', async () => {
    denyMarkers()
    const deletion = { onsuccess: () => {} }
    const transaction = {
      oncomplete: () => {},
      onerror: () => {},
      onabort: () => {},
      objectStore: () => ({ delete: () => deletion }),
    }
    const open = {
      result: { transaction: () => transaction, close: vi.fn() },
      onsuccess: () => {},
    }
    vi.stubGlobal('indexedDB', { open: () => open })
    const cleared = clearHomeSnapshot()
    open.onsuccess()
    deletion.onsuccess()
    let resolved = false
    void cleared.then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(false)
    transaction.oncomplete()
    expect(await cleared).toBe(true)
  })
})
