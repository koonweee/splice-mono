import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getNotificationPermission,
  isPushSupported,
  registerServiceWorker,
  urlBase64ToUint8Array,
} from './browser-push'

const mocks = vi.hoisted(() => ({
  getServiceWorkerRegistration: vi.fn(),
}))

vi.mock('../pwa/service-worker', () => ({
  getServiceWorkerRegistration: mocks.getServiceWorkerRegistration,
}))

describe('browser push helpers', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'atob', {
      value: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      configurable: true,
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {},
      configurable: true,
    })
    vi.stubGlobal('PushManager', vi.fn())
    vi.stubGlobal('Notification', { permission: 'default' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('converts VAPID base64url keys to Uint8Array', () => {
    const result = urlBase64ToUint8Array('AQIDBA')

    expect(Array.from(result)).toEqual([1, 2, 3, 4])
  })

  it('detects unsupported browsers', () => {
    vi.stubGlobal('Notification', undefined)

    expect(isPushSupported()).toBe(false)
    expect(getNotificationPermission()).toBe('unsupported')
  })

  it('uses the shared PWA service worker registration for push subscriptions', async () => {
    const registration = {
      pushManager: {
        getSubscription: vi.fn(),
      },
    } as unknown as ServiceWorkerRegistration
    mocks.getServiceWorkerRegistration.mockResolvedValue(registration)

    await expect(registerServiceWorker()).resolves.toBe(registration)

    expect(mocks.getServiceWorkerRegistration).toHaveBeenCalledTimes(1)
  })
})
