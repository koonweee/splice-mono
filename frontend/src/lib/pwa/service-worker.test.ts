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

  it('returns the active browser service worker registration', async () => {
    const registration = { scope: '/' } as ServiceWorkerRegistration
    const getRegistration = vi.fn().mockResolvedValue(registration)
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration,
        ready: Promise.resolve({ scope: '/ready' } as ServiceWorkerRegistration),
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

    await expect(
      registerPwaServiceWorker({ onRegisterError }),
    ).rejects.toThrow(registrationError)

    expect(onRegisterError).toHaveBeenCalledWith(registrationError)
  })
})
