import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PENDING_LOGOUT_COOKIE,
  PENDING_LOGOUT_KEY,
  clearPendingLogout,
  getPendingLogout,
  setPendingLogout,
} from './logout-state'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.cookie = `${PENDING_LOGOUT_COOKIE}=; Path=/; Max-Age=0`
})

describe('pending logout persistence', () => {
  it('survives a module reload and only the matching request can clear it', async () => {
    const first = setPendingLogout('device')
    const second = setPendingLogout('all')
    clearPendingLogout(first.id)
    expect(getPendingLogout()).toEqual(second)
    vi.resetModules()
    const reloaded = await import('./logout-state')
    expect(reloaded.getPendingLogout()).toEqual(second)
    reloaded.clearPendingLogout(second.id)
    expect(getPendingLogout()).toBeNull()
  })
  it('keeps logout-all intent and the privacy boundary when local storage is unavailable', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    setPendingLogout('all')
    expect(getPendingLogout()).toMatchObject({ mode: 'all' })
    expect(document.cookie).toContain(`${PENDING_LOGOUT_COOKIE}=`)
  })
  it('keeps distinct fallback request IDs so an older logout cannot clear a newer logout-all', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    const device = setPendingLogout('device')
    const all = setPendingLogout('all')
    expect(device.id).not.toBe(all.id)
    clearPendingLogout(device.id)
    expect(getPendingLogout()).toEqual(all)
    clearPendingLogout(all.id)
    expect(getPendingLogout()).toBeNull()
  })

  it('falls back to the cookie when stored metadata is malformed', () => {
    setPendingLogout('device')
    window.localStorage.setItem(PENDING_LOGOUT_KEY, '{broken')
    expect(getPendingLogout()).toMatchObject({ mode: 'device' })
    clearPendingLogout()
    expect(getPendingLogout()).toBeNull()
  })
})

it('keeps newer logout-all intent when an older device record remains readable', () => {
  const device = setPendingLogout('device')
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  const all = setPendingLogout('all')
  expect(getPendingLogout()).toEqual(all)
  clearPendingLogout(device.id)
  expect(getPendingLogout()).toEqual(all)
})
it('acknowledges logout even when the older storage record cannot be changed', async () => {
  const pending = setPendingLogout('all')
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new Error('read only')
  })
  vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
    throw new Error('read only')
  })
  clearPendingLogout(pending.id)
  expect(getPendingLogout()).toBeNull()
  vi.resetModules()
  expect((await import('./logout-state')).getPendingLogout()).toBeNull()
})

it('ignores malformed journal timestamps when creating a new privacy marker', () => {
  window.localStorage.setItem(
    PENDING_LOGOUT_KEY,
    JSON.stringify({
      id: crypto.randomUUID(),
      mode: 'device',
      issuedAt: 'broken',
    }),
  )
  const pending = setPendingLogout('all')
  expect(Number.isSafeInteger(pending.issuedAt)).toBe(true)
  expect(getPendingLogout()).toEqual(pending)
  expect(document.cookie).toMatch(
    /splice_logout_pending=all\.[a-f0-9-]{36}\.\d+/,
  )
})
