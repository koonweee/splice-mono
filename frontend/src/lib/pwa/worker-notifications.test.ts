import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as WorkerNotifications from './worker-notifications'
import type * as WorkerState from './worker-state'
import type { StoredWorkerControl } from './worker-state'

const mocks = vi.hoisted(() => ({
  state: {
    epoch: 'epoch-a',
    controlScope: 'a'.repeat(64),
    enrollmentId: 'enrollment-a',
    disabled: false,
    lastBadgeAsOf: null,
  } as StoredWorkerControl,
  change: vi.fn(),
  show: vi.fn(),
  close: vi.fn(),
  setBadge: vi.fn(),
  clearBadge: vi.fn(),
  fetch: vi.fn(),
  windows: vi.fn(),
  enumerate: vi.fn(),
  openWindow: vi.fn(),
  unsubscribe: vi.fn(),
}))
vi.mock('./worker-state', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkerState>()),
  changeWorkerControl: mocks.change,
}))
let worker: typeof WorkerNotifications
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.state = {
    epoch: 'epoch-a',
    controlScope: 'a'.repeat(64),
    enrollmentId: 'enrollment-a',
    disabled: false,
    lastBadgeAsOf: null,
  }
  mocks.change.mockImplementation(
    (change?: (state: StoredWorkerControl) => StoredWorkerControl) => {
      if (change) mocks.state = change(mocks.state)
      return Promise.resolve({ ...mocks.state })
    },
  )
  mocks.show.mockResolvedValue(undefined)
  mocks.setBadge.mockResolvedValue(undefined)
  mocks.clearBadge.mockResolvedValue(undefined)
  mocks.windows.mockResolvedValue([])
  mocks.enumerate.mockResolvedValue([{ close: mocks.close }])
  mocks.unsubscribe.mockResolvedValue(true)
  mocks.fetch.mockImplementation((url: string) =>
    Promise.resolve(
      Response.json(
        url === '/_pwa/recovery'
          ? { app: 'splice', status: 'ready', controlScope: 'a'.repeat(64) }
          : { eligible: true },
      ),
    ),
  )
  vi.stubGlobal('fetch', mocks.fetch)
  vi.stubGlobal('self', {
    location: { origin: 'https://splice.test' },
    navigator: { setAppBadge: mocks.setBadge, clearAppBadge: mocks.clearBadge },
    registration: {
      showNotification: mocks.show,
      getNotifications: mocks.enumerate,
      pushManager: {
        getSubscription: () =>
          Promise.resolve({ unsubscribe: mocks.unsubscribe }),
      },
    },
    clients: { matchAll: mocks.windows, openWindow: mocks.openWindow },
  })
  worker = await import('./worker-notifications')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const payload = () => ({
  version: 2,
  enrollmentId: 'enrollment-a',
  title: 'Private bank title',
  body: 'Private batch details',
  url: '/transactions?categoryId=UNCATEGORIZED',
  tag: 'notification-a',
  badgeCount: 12,
  badgeAsOf: '2026-09-07T12:00:00.000Z',
})
function push(value: unknown) {
  return worker.handlePrivatePush({
    data: { json: () => value },
  } as unknown as PushEvent)
}
async function message(
  data: Record<string, unknown>,
  origin = 'https://splice.test',
) {
  const response = vi.fn()
  await worker.handleWorkerControlMessage({
    data,
    source: { url: `${origin}/home` },
    ports: [{ postMessage: response }],
  } as unknown as ExtendableMessageEvent)
  return response
}

describe('private push enrollment and logout fences', () => {
  it.each([
    ['enrollment-a', 'enrollment-b'],
    [null, null],
    ['enrollment-a', 'enrollment-a'],
  ])(
    'rotates scope and fences queued badges across owner changes (%s to %s)',
    async (before, after) => {
      mocks.state.enrollmentId = before
      mocks.state.lastBadgeAsOf = '2026-09-07T11:00:00.000Z'
      const previousEpoch = mocks.state.epoch
      mocks.fetch.mockResolvedValueOnce(
        Response.json({
          app: 'splice',
          status: 'ready',
          controlScope: 'b'.repeat(64),
        }),
      )
      const bound = await message({
        type: 'PWA_SESSION_READY',
        epoch: previousEpoch,
        enrollmentId: after,
      })
      expect(bound).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
      expect(mocks.state.epoch).not.toBe(previousEpoch)
      expect(mocks.state.controlScope).toBe('b'.repeat(64))
      expect(mocks.state.lastBadgeAsOf).toBeNull()
      expect(mocks.clearBadge).toHaveBeenCalled()
      expect(mocks.close).toHaveBeenCalled()
      expect(
        await message({
          type: 'PWA_BADGE',
          epoch: previousEpoch,
          count: 99,
          computedAt: '2026-09-07T13:00:00.000Z',
        }),
      ).toHaveBeenCalledWith({ ok: false, code: 'stale_epoch' })
      expect(mocks.setBadge).not.toHaveBeenCalled()
      await message({
        type: 'PWA_BADGE',
        epoch: mocks.state.epoch,
        count: 2,
        computedAt: '2026-09-07T12:00:00.000Z',
      })
      expect(mocks.setBadge).toHaveBeenCalledWith(2)
    },
  )
  it.each(['enrollment-a', null])(
    'converges two same-owner windows with alternating summary reads (%s)',
    async (enrollmentId) => {
      mocks.state.enrollmentId = enrollmentId
      mocks.state.lastBadgeAsOf = '2026-09-07T11:00:00.000Z'
      const epoch = mocks.state.epoch
      const windowEpochs = [epoch, epoch]
      // Each visible window binds before its read completes. The other window may
      // also bind before that read returns; neither may invalidate the first.
      for (let cycle = 0; cycle < 5; cycle++) {
        for (let window = 0; window < 2; window++) {
          const get = await message({ type: 'PWA_CONTROL_GET' })
          const current = get.mock.calls[0][0].value as StoredWorkerControl
          const ready = await message({
            type: 'PWA_SESSION_READY',
            epoch: current.epoch,
            enrollmentId,
          })
          expect(ready).toHaveBeenCalledWith(
            expect.objectContaining({ ok: true }),
          )
          windowEpochs[window] = (
            ready.mock.calls[0][0].value as StoredWorkerControl
          ).epoch
        }
        for (let window = 0; window < 2; window++) {
          const count = cycle * 2 + window + 1
          const result = await message({
            type: 'PWA_BADGE',
            epoch: windowEpochs[window],
            count,
            computedAt: `2026-09-07T12:00:${String(count).padStart(2, '0')}.000Z`,
          })
          expect(result).toHaveBeenCalledWith(
            expect.objectContaining({ ok: true }),
          )
        }
      }
      expect(mocks.state.epoch).toBe(epoch)
      expect(mocks.setBadge.mock.calls.map(([count]) => count)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ])
      expect(mocks.clearBadge).not.toHaveBeenCalled()
      expect(mocks.close).not.toHaveBeenCalled()
      expect(mocks.state.lastBadgeAsOf).toBe('2026-09-07T12:00:10.000Z')
    },
  )
  it.each([
    { app: 'splice', status: 'login' },
    { app: 'splice', status: 'ready' },
    { app: 'foreign', status: 'ready', controlScope: 'a'.repeat(64) },
    { app: 'splice', status: 'ready', controlScope: 'raw-user-id' },
  ])('never binds an unverified scope: %j', async (result) => {
    mocks.state.enrollmentId = null
    const initial = { ...mocks.state }
    mocks.fetch.mockResolvedValueOnce(Response.json(result))
    expect(
      await message({
        type: 'PWA_SESSION_READY',
        epoch: initial.epoch,
        enrollmentId: null,
      }),
    ).toHaveBeenCalledWith({ ok: false })
    expect(mocks.state).toEqual(initial)
  })
  it('clears legacy native UI before an unavailable verified rebind', async () => {
    mocks.state.controlScope = null
    mocks.state.enrollmentId = null
    mocks.state.disabled = true
    await message({ type: 'PWA_CONTROL_GET' })
    mocks.fetch.mockRejectedValueOnce(new Error('offline'))
    expect(await message({ type: 'PWA_SESSION_READY', epoch: mocks.state.epoch, enrollmentId: null })).toHaveBeenCalledWith({ ok: false })
    expect(mocks.clearBadge).toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalled()
    expect(mocks.state.disabled).toBe(true)
  })
  it('rejects a scope response whose body is aborted after headers', async () => {
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    let started!: () => void
    const entered = new Promise<void>((resolve) => { started = resolve })
    mocks.fetch.mockImplementationOnce((_url: string, options: RequestInit) => Promise.resolve({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
        started()
      }),
    }))
    const initial = { ...mocks.state }
    try {
      const ready = message({ type: 'PWA_SESSION_READY', epoch: initial.epoch, enrollmentId: null })
      await entered
      controller.abort()
      expect(await ready).toHaveBeenCalledWith({ ok: false })
      expect(mocks.state).toEqual(initial)
    } finally { timeout.mockRestore() }
  })
  it('allows logout to complete while a scope probe is pending and rejects the late ready result', async () => {
    let release!: (response: Response) => void
    let started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    mocks.fetch.mockImplementationOnce(() => {
      started()
      return new Promise<Response>((resolve) => {
        release = resolve
      })
    })
    const ready = message({
      type: 'PWA_SESSION_READY',
      epoch: 'epoch-a',
      enrollmentId: null,
    })
    await entered
    await message({ type: 'PWA_DISABLE' })
    expect(mocks.state.disabled).toBe(true)
    release(
      Response.json({
        app: 'splice',
        status: 'ready',
        controlScope: 'a'.repeat(64),
      }),
    )
    expect(await ready).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false }),
    )
    expect(mocks.state.disabled).toBe(true)
  })
  it.each([
    'old enrollment',
    'disabled',
    'legacy',
    'server revoked',
    'network unavailable',
  ])('never displays private contents for %s', async (reason) => {
    const incoming = payload()
    if (reason === 'old enrollment') incoming.enrollmentId = 'old-owner'
    if (reason === 'disabled') mocks.state.disabled = true
    if (reason === 'legacy') incoming.version = 1
    if (reason === 'server revoked')
      mocks.fetch.mockResolvedValueOnce(Response.json({ eligible: false }))
    if (reason === 'network unavailable')
      mocks.fetch.mockRejectedValueOnce(new Error('offline'))
    await push(incoming)
    expect(mocks.show).toHaveBeenCalledWith(
      'Splice',
      expect.objectContaining({ data: { url: '/' } }),
    )
    expect(JSON.stringify(mocks.show.mock.calls)).not.toContain('Private')
    expect(mocks.setBadge).not.toHaveBeenCalled()
  })
  it('checks the current server session before displaying a matching private enrollment', async () => {
    await push(payload())
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/_pwa/enrollment',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      }),
    )
    expect(mocks.show).toHaveBeenCalledWith(
      'Private bank title',
      expect.objectContaining({ body: 'Private batch details' }),
    )
    expect(mocks.setBadge).toHaveBeenCalledWith(12)
  })
  it('prevents a delayed successful validation response from crossing logout', async () => {
    let release!: (response: Response) => void
    let started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    mocks.fetch.mockImplementationOnce(() => {
      started()
      return new Promise<Response>((resolve) => {
        release = resolve
      })
    })
    const pending = push(payload())
    await entered
    const disabled = message({ type: 'PWA_DISABLE' })
    release(Response.json({ eligible: true }))
    await Promise.all([pending, disabled])
    expect(JSON.stringify(mocks.show.mock.calls)).not.toContain('Private')
    expect(mocks.state.disabled).toBe(true)
    expect(mocks.close).toHaveBeenCalled()
  })
  it('stays disabled after a failed durable write and storage recovery', async () => {
    mocks.change.mockRejectedValueOnce(new Error('storage full'))
    expect(await message({ type: 'PWA_DISABLE' })).toHaveBeenCalledWith({
      ok: false,
    })
    expect(mocks.state.disabled).toBe(false) // old disk image survived; volatile fence must protect it.
    await push(payload())
    expect(JSON.stringify(mocks.show.mock.calls)).not.toContain('Private')
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalled()
  })
  it('rejects an older handshake and old badge messages after a successful disable', async () => {
    await message({ type: 'PWA_DISABLE' })
    expect(
      await message({
        type: 'PWA_SESSION_READY',
        epoch: 'epoch-a',
        enrollmentId: 'old-owner',
      }),
    ).toHaveBeenCalledWith({ ok: false, code: 'stale_epoch' })
    expect(
      await message({
        type: 'PWA_BADGE',
        epoch: 'epoch-a',
        count: 99,
        computedAt: '2026-09-07T13:00:00.000Z',
      }),
    ).toHaveBeenCalledWith({ ok: false, code: 'stale_epoch' })
    expect(mocks.state.disabled).toBe(true)
    expect(mocks.setBadge).not.toHaveBeenCalled()
  })
  it('does not let a ready handshake already waiting on storage undo a newer logout', async () => {
    let release!: (state: StoredWorkerControl) => void
    let started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    mocks.change.mockImplementationOnce(() => {
      started()
      return new Promise<StoredWorkerControl>((resolve) => {
        release = resolve
      })
    })
    const ready = message({
      type: 'PWA_SESSION_READY',
      epoch: 'epoch-a',
      enrollmentId: 'enrollment-a',
    })
    await entered
    const disable = message({ type: 'PWA_DISABLE' })
    release({ ...mocks.state })
    expect(await ready).toHaveBeenCalledWith({ ok: false })
    await disable
    expect(mocks.state.disabled).toBe(true)
    await push(payload())
    expect(JSON.stringify(mocks.show.mock.calls)).not.toContain('Private')
  })

  it('ignores foreign windows before they alter enrollment state', async () => {
    const response = await message(
      { type: 'PWA_DISABLE' },
      'https://foreign.test',
    )
    expect(response).not.toHaveBeenCalled()
    expect(mocks.change).not.toHaveBeenCalled()
    expect(mocks.state.disabled).toBe(false)
  })
})

describe('trustworthy badge ordering', () => {
  it('keeps failed badge writes retryable and accepts zero as a clear', async () => {
    mocks.setBadge.mockRejectedValueOnce(new Error('OS failed'))
    await push(payload())
    expect(mocks.state.lastBadgeAsOf).toBeNull()
    await push(payload())
    expect(mocks.setBadge).toHaveBeenCalledTimes(2)
    expect(mocks.state.lastBadgeAsOf).toBe(payload().badgeAsOf)
    await message({
      type: 'PWA_BADGE',
      epoch: 'epoch-a',
      count: 30,
      computedAt: '2026-09-07T11:00:00.000Z',
    })
    expect(mocks.setBadge).toHaveBeenCalledTimes(2)
    await message({
      type: 'PWA_BADGE',
      epoch: 'epoch-a',
      count: 0,
      computedAt: '2026-09-07T13:00:00.000Z',
    })
    expect(mocks.clearBadge).toHaveBeenCalledOnce()
  })
})

describe('notification destination handling', () => {
  it('opens a safe route for a matching enrollment and removes old-owner destinations', async () => {
    const close = vi.fn()
    await worker.handlePrivateNotificationClick({
      notification: {
        close,
        data: { url: '/accounts', enrollmentId: 'enrollment-a' },
      },
    } as unknown as NotificationEvent)
    expect(mocks.openWindow).toHaveBeenCalledWith(
      'https://splice.test/accounts',
    )
    await worker.handlePrivateNotificationClick({
      notification: {
        close,
        data: { url: '/accounts', enrollmentId: 'old-owner' },
      },
    } as unknown as NotificationEvent)
    expect(mocks.openWindow).toHaveBeenLastCalledWith('https://splice.test/')
    expect(close).toHaveBeenCalledTimes(2)
  })
})

it('clears a late push badge even when notification enumeration fails during logout', async () => {
  let finishBadge!: () => void
  let startBadge!: () => void
  const started = new Promise<void>((resolve) => {
    startBadge = resolve
  })
  mocks.setBadge.mockImplementationOnce(() => {
    startBadge()
    return new Promise<void>((resolve) => {
      finishBadge = resolve
    })
  })
  const sending = push(payload())
  await started
  mocks.enumerate.mockRejectedValue(new Error('OS enumeration failed'))
  const disabling = message({ type: 'PWA_DISABLE' })
  finishBadge()
  await Promise.all([sending, disabling])
  expect(mocks.clearBadge).toHaveBeenCalled()
  expect(mocks.clearBadge.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
    mocks.setBadge.mock.invocationCallOrder[0],
  )
  expect(mocks.state.disabled).toBe(true)
})

it('clears a push that passed live validation but was still being displayed when disable arrived', async () => {
  let displayed!: () => void
  let entered!: () => void
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  mocks.show.mockImplementationOnce(() => {
    entered()
    return new Promise<void>((resolve) => {
      displayed = resolve
    })
  })
  const sending = push(payload())
  await started
  const disabling = message({ type: 'PWA_DISABLE' })
  // The page clears immediately, before the already-started OS operation ends.
  await mocks.clearBadge()
  displayed()
  await Promise.all([sending, disabling])
  expect(mocks.state.disabled).toBe(true)
  expect(mocks.close).toHaveBeenCalled()
  expect(mocks.clearBadge.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
    mocks.setBadge.mock.invocationCallOrder[0],
  )
})

it('releases the state queue after a hung native badge and clears again if it settles after logout', async () => {
  vi.useFakeTimers()
  let settleNative!: () => void
  mocks.setBadge.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        settleNative = resolve
      }),
  )
  const writing = message({
    type: 'PWA_BADGE',
    epoch: 'epoch-a',
    count: 99,
    computedAt: '2026-09-07T13:00:00.000Z',
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.setBadge).toHaveBeenCalledWith(99)
  const disabling = message({ type: 'PWA_DISABLE' })
  await vi.advanceTimersByTimeAsync(3_000)
  await Promise.all([writing, disabling])
  expect(mocks.state.disabled).toBe(true)
  const clears = mocks.clearBadge.mock.calls.length
  expect(clears).toBeGreaterThan(0)
  settleNative()
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.clearBadge.mock.calls.length).toBeGreaterThan(clears)
  const binding = message({
    type: 'PWA_SESSION_READY',
    epoch: mocks.state.epoch,
    enrollmentId: null,
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(await binding).toHaveBeenCalledWith(
    expect.objectContaining({ ok: true }),
  )
})
