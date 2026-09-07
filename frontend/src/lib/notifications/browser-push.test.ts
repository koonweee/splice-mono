import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as BrowserPush from './browser-push'

const mocks = vi.hoisted(() => ({
  registration: vi.fn(),
  request: vi.fn(),
  permission: vi.fn(),
  bind: vi.fn(),
  disable: vi.fn(),
  worker: vi.fn(),
  generation: 1,
  blocked: false,
  pending: false,
  existing: null as PushSubscription | null,
}))
vi.mock('../../api/axios', () => ({ axios: mocks.request }))
vi.mock('../pwa/service-worker', () => ({
  getServiceWorkerRegistration: mocks.registration,
}))
vi.mock('../auth-generation', () => ({
  getAuthGeneration: () => mocks.generation,
  isPrivateUiBlocked: () => mocks.blocked,
  assertAuthGeneration: (generation: number) => {
    if (generation !== mocks.generation)
      throw new DOMException('Session changed', 'AbortError')
  },
}))
vi.mock('../pwa/logout-state', () => ({
  getPendingLogout: () =>
    mocks.pending ? { id: 'pending', mode: 'device' } : null,
}))
vi.mock('../pwa/worker-channel', () => ({
  bindWorkerSession: mocks.bind,
  disableWorkerSession: mocks.disable,
  sendWorkerMessage: mocks.worker,
}))

let helper: typeof BrowserPush
let registration: {
  pushManager: {
    getSubscription: ReturnType<typeof vi.fn>
    subscribe: ReturnType<typeof vi.fn>
  }
}
let notification: {
  permission: NotificationPermission
  requestPermission: typeof mocks.permission
}
let status: {
  configured: boolean
  subscribed: boolean
  rebindRequired: boolean
  enrollmentId: string | null
}
const paths = () =>
  mocks.request.mock.calls.map(([config]) => config.url as string)
function subscription(key = [1, 2, 3, 4]) {
  return {
    endpoint: 'https://push.example.test/device',
    options: { applicationServerKey: new Uint8Array(key).buffer },
    unsubscribe: vi.fn().mockImplementation(() => {
      mocks.existing = null
      return Promise.resolve(true)
    }),
    toJSON: () => ({
      endpoint: 'https://push.example.test/device',
      expirationTime: null,
      keys: { p256dh: 'synthetic-key', auth: 'synthetic-auth' },
    }),
  } as unknown as PushSubscription
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.generation = 1
  mocks.blocked = false
  mocks.pending = false
  mocks.existing = null
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
  notification = { permission: 'default', requestPermission: mocks.permission }
  mocks.permission.mockImplementation(() => {
    notification.permission = 'granted'
    return Promise.resolve('granted')
  })
  vi.stubGlobal('Notification', notification)
  vi.stubGlobal('PushManager', vi.fn())
  registration = {
    pushManager: {
      getSubscription: vi
        .fn()
        .mockImplementation(() => Promise.resolve(mocks.existing)),
      subscribe: vi.fn().mockImplementation(() => {
        mocks.existing = subscription()
        return Promise.resolve(mocks.existing)
      }),
    },
  }
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: () => Promise.resolve(registration) },
    userAgent: 'Test desktop',
    platform: 'Test',
    maxTouchPoints: 0,
  })
  mocks.registration.mockResolvedValue(registration)
  mocks.bind.mockResolvedValue({
    epoch: 'worker-epoch',
    enrollmentId: 'enrollment-b',
    disabled: false,
  })
  mocks.disable.mockResolvedValue(undefined)
  mocks.worker.mockResolvedValue({
    epoch: 'worker-epoch',
    enrollmentId: null,
    disabled: true,
  })
  status = {
    configured: true,
    subscribed: false,
    rebindRequired: false,
    enrollmentId: null,
  }
  mocks.request.mockImplementation(
    (config: { url: string; method: string }) => {
      if (config.url === '/notification/push/config')
        return Promise.resolve({ configured: true, vapidPublicKey: 'AQIDBA' })
      if (config.url === '/notification/push/subscription/current')
        return Promise.resolve({ ...status })
      if (config.method === 'POST') {
        status = {
          configured: true,
          subscribed: true,
          rebindRequired: false,
          enrollmentId: 'enrollment-b',
        }
        return Promise.resolve({ enrollmentId: 'enrollment-b' })
      }
      return Promise.resolve(undefined)
    },
  )
  helper = await import('./browser-push')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('browser push helpers', () => {
  it('converts VAPID base64url keys and detects unsupported browsers', () => {
    expect(Array.from(helper.urlBase64ToUint8Array('AQIDBA'))).toEqual([
      1, 2, 3, 4,
    ])
    vi.stubGlobal('Notification', undefined)
    expect(helper.isPushSupported()).toBe(false)
    expect(helper.getNotificationPermission()).toBe('unsupported')
  })
  it('uses the shared PWA service worker registration', async () => {
    await expect(helper.registerServiceWorker()).resolves.toBe(registration)
    expect(mocks.registration).toHaveBeenCalledOnce()
  })
  it('requests native permission synchronously before waiting for delayed configuration', async () => {
    let resolveConfig!: (value: unknown) => void
    mocks.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConfig = resolve
        }),
    )
    const pending = helper.enableCurrentDeviceNotifications()
    expect(mocks.permission).toHaveBeenCalledOnce()
    expect(mocks.request).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(resolveConfig).toBeTypeOf('function'))
    resolveConfig({ configured: true, vapidPublicKey: 'AQIDBA' })
    await pending
    expect(mocks.bind).toHaveBeenCalledWith('enrollment-b')
  })
  it('deduplicates rapid clicks and asks permission only once', async () => {
    let permission!: (value: string) => void
    mocks.permission.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          permission = resolve
        }),
    )
    const first = helper.enableCurrentDeviceNotifications()
    const second = helper.enableCurrentDeviceNotifications()
    expect(mocks.permission).toHaveBeenCalledOnce()
    permission('granted')
    await Promise.all([first, second])
    expect(registration.pushManager.subscribe).toHaveBeenCalledOnce()
    expect(
      paths().filter((path) => path === '/notification/push/subscriptions'),
    ).toHaveLength(1)
  })
  it('settles failed configuration or readiness and allows another attempt', async () => {
    mocks.request.mockRejectedValueOnce(new Error('config failed'))
    await expect(helper.enableCurrentDeviceNotifications()).rejects.toThrow(
      'config failed',
    )
    mocks.registration.mockRejectedValueOnce(new Error('registration failed'))
    await expect(helper.enableCurrentDeviceNotifications()).rejects.toThrow(
      'registration failed',
    )
    await expect(
      helper.enableCurrentDeviceNotifications(),
    ).resolves.toBeUndefined()
    expect(mocks.bind).toHaveBeenCalledOnce()
  })
  it('unsubscribes a rotated VAPID key before creating the replacement', async () => {
    const old = subscription([9, 9, 9, 9])
    mocks.existing = old
    await helper.enableCurrentDeviceNotifications()
    expect(old.unsubscribe).toHaveBeenCalledOnce()
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: new Uint8Array([1, 2, 3, 4]),
      }),
    )
  })
  it('does not enroll replacement keys when the browser cannot remove the old subscription', async () => {
    const old = subscription([9, 9, 9, 9])
    mocks.existing = old
    vi.mocked(old.unsubscribe).mockResolvedValueOnce(false)
    await expect(helper.enableCurrentDeviceNotifications()).rejects.toThrow(
      'could not be removed',
    )
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
    expect(paths()).not.toContain('/notification/push/subscriptions')
  })

  it('retains a recoverable browser subscription after a failed POST and reuses it on retry', async () => {
    const normal = mocks.request.getMockImplementation()!
    mocks.request.mockImplementation(
      (config: { url: string; method: string }) =>
        config.method === 'POST'
          ? Promise.reject(new Error('enrollment failed'))
          : normal(config),
    )
    await expect(helper.enableCurrentDeviceNotifications()).rejects.toThrow(
      'enrollment failed',
    )
    expect(mocks.existing).not.toBeNull()
    expect(mocks.bind).not.toHaveBeenCalled()
    mocks.request.mockImplementation(normal)
    await expect(
      helper.enableCurrentDeviceNotifications(),
    ).resolves.toBeUndefined()
    expect(registration.pushManager.subscribe).toHaveBeenCalledOnce()
    expect(mocks.bind).toHaveBeenCalledWith('enrollment-b')
  })
  it('bounds a hanging native subscribe and allows retry', async () => {
    vi.useFakeTimers()
    registration.pushManager.subscribe.mockImplementationOnce(
      () => new Promise(() => {}),
    )
    const pending = helper.enableCurrentDeviceNotifications()
    const failure = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10000)
    await failure
    await expect(
      helper.enableCurrentDeviceNotifications(),
    ).resolves.toBeUndefined()
  })
  it('unsubscribes locally even if server DELETE fails', async () => {
    const old = subscription()
    mocks.existing = old
    mocks.request.mockRejectedValueOnce(new Error('offline'))
    await expect(helper.disableCurrentDeviceNotifications()).rejects.toThrow(
      'offline',
    )
    expect(old.unsubscribe).toHaveBeenCalledOnce()
    expect(window.localStorage.getItem('splice:push-explicitly-off')).toBe(
      'true',
    )
  })
  it('keeps explicit disable authoritative over an earlier pending enable', async () => {
    let resolveConfig!: (value: unknown) => void
    mocks.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConfig = resolve
        }),
    )
    const enabling = helper.enableCurrentDeviceNotifications()
    const outcome = enabling.then(
      () => null,
      (error: unknown) => error,
    )
    await vi.waitFor(() => expect(resolveConfig).toBeTypeOf('function'))
    const disabling = helper.disableCurrentDeviceNotifications()
    resolveConfig({ configured: true, vapidPublicKey: 'AQIDBA' })
    expect(await outcome).not.toBeNull()
    await disabling
    expect(paths()).not.toContain('/notification/push/subscriptions')
    expect(mocks.bind).not.toHaveBeenCalledWith('enrollment-b')
    expect(window.localStorage.getItem('splice:push-explicitly-off')).toBe(
      'true',
    )
  })

  it('honors another tab changing notification intent while configuration is delayed', async () => {
    let resolveConfig!: (value: unknown) => void
    mocks.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConfig = resolve
        }),
    )
    const enabling = helper.enableCurrentDeviceNotifications()
    const outcome = enabling.then(
      () => null,
      (error: unknown) => error,
    )
    await vi.waitFor(() => expect(resolveConfig).toBeTypeOf('function'))
    window.localStorage.setItem('splice:push-intent', 'other-tab-disable')
    window.localStorage.setItem('splice:push-explicitly-off', 'true')
    resolveConfig({ configured: true, vapidPublicKey: 'AQIDBA' })
    expect(await outcome).not.toBeNull()
    expect(paths()).not.toContain('/notification/push/subscriptions')
  })

  it('does not let stalled worker cleanup prevent server revocation or local unsubscribe', async () => {
    const old = subscription()
    mocks.existing = old
    mocks.disable.mockImplementationOnce(() => new Promise<void>(() => {}))
    vi.useFakeTimers()
    const pending = helper.disableCurrentDeviceNotifications()
    await vi.advanceTimersByTimeAsync(0)
    expect(old.unsubscribe).toHaveBeenCalledOnce()
    expect(paths()).toContain('/notification/push/subscriptions/current')
    await vi.advanceTimersByTimeAsync(3000)
    await pending
    expect(mocks.disable.mock.calls[0][0]()).toBe(false)
    expect(mocks.bind).toHaveBeenCalledWith(null)
  })
})

describe('migration and identity reconciliation', () => {
  beforeEach(() => {
    notification.permission = 'granted'
    mocks.existing = subscription()
  })
  it('automatically enrolls only migration-eligible devices without asking permission', async () => {
    status.rebindRequired = true
    await helper.reconcileDeviceNotifications()
    expect(paths()).toContain('/notification/push/subscriptions')
    expect(mocks.permission).not.toHaveBeenCalled()
  })
  it.each(['wrong owner', 'explicit off', 'permission denied'])(
    'does not auto-enroll for %s',
    async (reason) => {
      status.rebindRequired = reason !== 'wrong owner'
      if (reason === 'explicit off')
        window.localStorage.setItem('splice:push-explicitly-off', 'true')
      if (reason === 'permission denied') notification.permission = 'denied'
      await helper.reconcileDeviceNotifications()
      expect(paths()).not.toContain('/notification/push/subscriptions')
      expect(mocks.permission).not.toHaveBeenCalled()
    },
  )
  it('does not POST if identity changed while getting the native subscription', async () => {
    registration.pushManager.getSubscription.mockImplementationOnce(() => {
      mocks.generation++
      return Promise.resolve(mocks.existing)
    })
    await expect(
      helper.enableCurrentDeviceNotifications(),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(paths()).not.toContain('/notification/push/subscriptions')
    expect(mocks.bind).not.toHaveBeenCalled()
  })
  it('does not bind an enrollment returned after identity changed during POST', async () => {
    const normal = mocks.request.getMockImplementation()!
    mocks.request.mockImplementation(
      (config: { url: string; method: string }) => {
        if (config.method === 'POST') mocks.generation++
        return normal(config)
      },
    )
    await expect(
      helper.enableCurrentDeviceNotifications(),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.bind).not.toHaveBeenCalled()
  })
  it('does not bind an older status response after identity changes', async () => {
    const normal = mocks.request.getMockImplementation()!
    mocks.request.mockImplementation(
      (config: { url: string; method: string }) => {
        if (config.url === '/notification/push/subscription/current') {
          mocks.generation++
          return Promise.resolve({
            configured: true,
            subscribed: true,
            rebindRequired: false,
            enrollmentId: 'old-owner',
          })
        }
        return normal(config)
      },
    )
    await expect(
      helper.loadCurrentDeviceNotificationState(),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.bind).not.toHaveBeenCalled()
  })
})
