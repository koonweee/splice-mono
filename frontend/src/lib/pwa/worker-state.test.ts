import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptsBadgeSnapshot,
  changeWorkerControl,
  safeNotificationDestination,
  serializeWorkerState,
  validBadgeSnapshot,
} from './worker-state'
import type { StoredWorkerControl } from './worker-state'

describe('durable worker privacy control', () => {
  let stored: StoredWorkerControl | undefined
  beforeEach(() => {
    stored = undefined
    vi.stubGlobal('indexedDB', {
      open: () => {
        const open: Record<string, unknown> = {}
        const transaction: Record<string, unknown> = {
          objectStore: () => ({
            get: () => {
              const read: {
                result: StoredWorkerControl | undefined
                onsuccess?: () => void
              } = { result: structuredClone(stored) }
              queueMicrotask(() => read.onsuccess?.())
              return read
            },
            put: (value: StoredWorkerControl) => {
              stored = structuredClone(value)
              queueMicrotask(() => (transaction.oncomplete as () => void)())
            },
          }),
        }
        open.result = { transaction: () => transaction, close: vi.fn() }
        queueMicrotask(() => (open.onsuccess as () => void)())
        return open
      },
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('starts disabled and stores only opaque enrollment and ordering control', async () => {
    const initial = await changeWorkerControl()
    expect(initial).toMatchObject({
      disabled: true,
      enrollmentId: null,
      lastBadgeAsOf: null,
    })
    const ready = await changeWorkerControl((current) => ({
      ...current,
      enrollmentId: 'enrollment-a',
      controlScope: 'a'.repeat(64),
      disabled: false,
    }))
    expect(await changeWorkerControl()).toEqual(ready)
    expect(Object.keys(stored!).sort()).toEqual([
      'controlScope',
      'disabled',
      'enrollmentId',
      'epoch',
      'lastBadgeAsOf',
    ])
  })
  it('requires a verified rebind for legacy records lacking an owner scope', async () => {
    stored = {
      epoch: 'old',
      enrollmentId: 'old-enrollment',
      disabled: false,
      lastBadgeAsOf: '2026-09-07T12:00:00.000Z',
    } as StoredWorkerControl
    const current = await changeWorkerControl()
    expect(current).toMatchObject({
      controlScope: null,
      enrollmentId: null,
      disabled: true,
      lastBadgeAsOf: null,
    })
    expect(current.epoch).not.toBe('old')
    expect(await changeWorkerControl()).toEqual(current)
  })
  it('bounds inaccessible storage and allows a later retry', async () => {
    vi.useFakeTimers()
    const original = indexedDB
    vi.stubGlobal('indexedDB', { open: () => ({}) })
    const pending = changeWorkerControl()
    const rejected = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(3000)
    await rejected
    vi.stubGlobal('indexedDB', original)
    await expect(changeWorkerControl()).resolves.toMatchObject({
      disabled: true,
    })
  })
  it('keeps privacy mutations serialized even after one rejects', async () => {
    const order: Array<string> = []
    let release!: () => void
    const first = serializeWorkerState(async () => {
      order.push('first')
      await new Promise<void>((resolve) => {
        release = resolve
      })
      throw new Error('synthetic')
    })
    const rejected = first.catch(() => order.push('failed'))
    const second = serializeWorkerState(async () => {
      order.push('second')
    })
    await Promise.resolve()
    expect(order).toEqual(['first'])
    release()
    await Promise.all([rejected, second])
    expect(order).toEqual(['first', 'failed', 'second'])
  })
})

describe('worker notification input boundaries', () => {
  it('rejects foreign, malformed, or unsupported destinations', () => {
    for (const url of [
      'https://evil.test/accounts',
      '//evil.test/accounts',
      '/\\evil.test/accounts',
      'javascript:alert(1)',
      '/user/logout',
      null,
    ]) {
      expect(safeNotificationDestination(url, 'https://splice.test')).toBeNull()
    }
    expect(
      safeNotificationDestination(
        '/transactions?categoryId=UNCATEGORIZED#review',
        'https://splice.test',
      ),
    ).toBe('/transactions?categoryId=UNCATEGORIZED#review')
  })
  it('accepts zero and prevents older/equal badge observations overwriting a newer count', () => {
    const current = {
      epoch: 'a',
      controlScope: 'a'.repeat(64),
      enrollmentId: 'b',
      disabled: false,
      lastBadgeAsOf: '2026-09-07T12:00:00.000Z',
    }
    expect(validBadgeSnapshot(0, '2026-09-07T12:01:00.000Z')).toBe(true)
    for (const count of [-1, 0.2, Infinity, '1', NaN])
      expect(validBadgeSnapshot(count, current.lastBadgeAsOf)).toBe(false)
    expect(validBadgeSnapshot(3, 'not-a-date')).toBe(false)
    expect(acceptsBadgeSnapshot(current, '2026-09-07T11:59:00.000Z')).toBe(
      false,
    )
    expect(acceptsBadgeSnapshot(current, current.lastBadgeAsOf)).toBe(false)
    expect(acceptsBadgeSnapshot(current, '2026-09-07T12:01:00.000Z')).toBe(true)
  })
})
