import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPwaUpdateState,
  getServiceWorkerRegistration,
  registerPwaServiceWorker,
  resetPwaServiceWorkerStateForTests,
  setRegisterSWLoaderForTests,
  subscribeToPwaUpdates,
} from './service-worker'
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'

describe('PWA service worker helper', () => {
  beforeEach(() => {
    const localStorageData = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      value: {
        clear: vi.fn(() => localStorageData.clear()),
        getItem: vi.fn((key: string) => localStorageData.get(key) ?? null),
        removeItem: vi.fn((key: string) => localStorageData.delete(key)),
        setItem: vi.fn((key: string, value: string) =>
          localStorageData.set(key, value),
        ),
      },
      configurable: true,
    })
    Object.defineProperty(window, 'caches', {
      value: {
        delete: vi.fn().mockResolvedValue(true),
        keys: vi.fn().mockResolvedValue([]),
      },
      configurable: true,
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: vi.fn(),
        ready: Promise.resolve({ scope: '/' } as ServiceWorkerRegistration),
      },
      configurable: true,
    })
  })

  afterEach(() => {
    resetPwaServiceWorkerStateForTests()
    vi.clearAllMocks()
  })

  it('registers through vite-plugin-pwa and exposes update state', async () => {
    let registerOptions: RegisterSWOptions | undefined
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined)
    const listener = vi.fn()

    setRegisterSWLoaderForTests(() =>
      Promise.resolve((options) => {
        registerOptions = options

        return updateServiceWorker
      }),
    )
    subscribeToPwaUpdates(listener)

    await registerPwaServiceWorker()
    registerOptions?.onNeedRefresh?.()
    await getPwaUpdateState().updateServiceWorker?.()

    expect(registerOptions?.immediate).toBe(true)
    expect(listener).toHaveBeenLastCalledWith({
      needRefresh: true,
      updateServiceWorker: expect.any(Function),
    })
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('removes legacy app caches before registering', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true)
    const listCaches = vi
      .fn()
      .mockResolvedValue([
        'splice-app-shell-v1',
        'workbox-precache-v2-https://splice.kw0.dev/',
        'unrelated-cache',
      ])
    Object.defineProperty(window, 'caches', {
      value: {
        delete: deleteCache,
        keys: listCaches,
      },
      configurable: true,
    })
    setRegisterSWLoaderForTests(() => Promise.resolve(() => vi.fn()))

    await registerPwaServiceWorker()

    expect(deleteCache).toHaveBeenCalledTimes(2)
    expect(deleteCache).toHaveBeenCalledWith('splice-app-shell-v1')
    expect(deleteCache).toHaveBeenCalledWith(
      'workbox-precache-v2-https://splice.kw0.dev/',
    )
    expect(deleteCache).not.toHaveBeenCalledWith('unrelated-cache')
    expect(window.localStorage.getItem('splice-pwa-cache-schema')).toBe('2')
  })

  it('returns the active browser service worker registration', async () => {
    const registration = { scope: '/' } as ServiceWorkerRegistration
    const getRegistration = vi.fn().mockResolvedValue(registration)
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration,
        ready: Promise.resolve({
          scope: '/ready',
        } as ServiceWorkerRegistration),
      },
      configurable: true,
    })
    setRegisterSWLoaderForTests(() => Promise.resolve(() => vi.fn()))

    await expect(getServiceWorkerRegistration()).resolves.toBe(registration)

    expect(getRegistration).toHaveBeenCalledTimes(1)
  })

  it('rejects when vite-plugin-pwa registration fails', async () => {
    const registrationError = new Error('registration failed')
    const onRegisterError = vi.fn()
    setRegisterSWLoaderForTests(() => Promise.reject(registrationError))

    await expect(registerPwaServiceWorker({ onRegisterError })).rejects.toThrow(
      registrationError,
    )

    expect(onRegisterError).toHaveBeenCalledWith(registrationError)
  })
})
