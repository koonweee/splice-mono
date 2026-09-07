import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APP_BUILD_ID,
  checkForPwaUpdate,
  getPwaUpdateState,
  getServiceWorkerRegistration,
  pwaNavigation,
  registerPwaServiceWorker,
  reportChunkLoadFailure,
  resetPwaServiceWorkerStateForTests,
  subscribeToPwaUpdates,
} from './service-worker'
import { registerAppTransitionGuard } from './app-transition'

class Worker extends EventTarget {
  constructor(public state: ServiceWorkerState = 'activated') {
    super()
  }
  postMessage = vi.fn()
  change(state: ServiceWorkerState) {
    this.state = state
    this.dispatchEvent(new Event('statechange'))
  }
}
class Registration extends EventTarget {
  active: Worker | null = new Worker()
  installing: Worker | null = null
  waiting: Worker | null = null
  update = vi.fn().mockResolvedValue(undefined)
}
class Container extends EventTarget {
  controller: Worker | null = new Worker()
  register = vi.fn()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
let registration: Registration
let container: Container
let releaseGuard: (() => void) | undefined
let reload: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  registration = new Registration()
  container = new Container()
  container.register.mockResolvedValue(registration)
  vi.stubGlobal('navigator', { serviceWorker: container, onLine: true })
  vi.stubGlobal('caches', { delete: vi.fn().mockResolvedValue(true) })
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  reload = vi.spyOn(pwaNavigation, 'reload').mockImplementation(() => {})
})
afterEach(() => {
  releaseGuard?.()
  releaseGuard = undefined
  resetPwaServiceWorkerStateForTests()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('native PWA service worker lifecycle', () => {
  it('deduplicates registration, waits for activation, and reports offline readiness once active', async () => {
    const worker = new Worker('installing')
    registration.active = null
    registration.installing = worker
    container.controller = null
    const ready = vi.fn()
    const first = registerPwaServiceWorker({ onOfflineReady: ready })
    const second = getServiceWorkerRegistration()
    await flush()
    expect(container.register).toHaveBeenCalledOnce()
    expect(container.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
    expect(getPwaUpdateState().status).toBe('registering')
    expect(ready).not.toHaveBeenCalled()
    registration.active = worker
    registration.installing = null
    container.controller = worker
    worker.change('activated')
    container.dispatchEvent(new Event('controllerchange'))
    await first
    expect(await second).toBe(registration)
    expect(ready).toHaveBeenCalledOnce()
    expect(getPwaUpdateState()).toMatchObject({
      status: 'ready',
      needRefresh: false,
    })
    expect(reload).not.toHaveBeenCalled()
  })

  it('bounds a stalled register call and allows a fresh retry without accepting the late attempt', async () => {
    const late = deferred<Registration>()
    container.register.mockReturnValueOnce(late.promise)
    const failed = expect(getServiceWorkerRegistration()).rejects.toThrow(
      'timed out',
    )
    await vi.advanceTimersByTimeAsync(10_000)
    await failed
    expect(getPwaUpdateState().status).toBe('failed')
    expect(await getServiceWorkerRegistration()).toBe(registration)
    expect(container.register).toHaveBeenCalledTimes(2)
    late.resolve(new Registration())
    await flush()
    expect(getPwaUpdateState().status).toBe('ready')
    expect(await getServiceWorkerRegistration()).toBe(registration)
  })

  it('rejects failed installation, reports its error, and retries successfully', async () => {
    const worker = new Worker('installing')
    registration.active = null
    registration.installing = worker
    const onRegisterError = vi.fn()
    const failure = expect(
      registerPwaServiceWorker({ onRegisterError }),
    ).rejects.toThrow('installation failed')
    await flush()
    worker.change('redundant')
    await failure
    expect(onRegisterError).toHaveBeenCalledOnce()
    registration = new Registration()
    container.register.mockResolvedValue(registration)
    expect(await getServiceWorkerRegistration()).toBe(registration)
  })

  it('times out a worker that never activates and cleans readiness listeners', async () => {
    const worker = new Worker('installing')
    const remove = vi.spyOn(worker, 'removeEventListener')
    registration.active = null
    registration.installing = worker
    const failure = expect(getServiceWorkerRegistration()).rejects.toThrow(
      'timed out',
    )
    await vi.advanceTimersByTimeAsync(10_000)
    await failure
    expect(remove).toHaveBeenCalledWith('statechange', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves unrelated and release caches while removing the legacy private shell', async () => {
    await getServiceWorkerRegistration()
    expect(caches.delete).toHaveBeenCalledOnce()
    expect(caches.delete).toHaveBeenCalledWith('splice-app-shell-v1')
  })

  it('settles unsupported browsers without starting registration', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    await expect(registerPwaServiceWorker()).resolves.toBeUndefined()
    await expect(getServiceWorkerRegistration()).rejects.toThrow('unavailable')
    expect(container.register).not.toHaveBeenCalled()
  })

  it('announces a waiting update and never reloads after another tab activates it', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToPwaUpdates(listener)
    await getServiceWorkerRegistration()
    registration.waiting = new Worker('installed')
    registration.dispatchEvent(new Event('updatefound'))
    expect(getPwaUpdateState()).toMatchObject({
      status: 'update-waiting',
      needRefresh: true,
    })
    container.controller = registration.waiting
    registration.waiting = null
    container.dispatchEvent(new Event('controllerchange'))
    expect(reload).not.toHaveBeenCalled()
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ needRefresh: true }),
    )
    unsubscribe()
  })

  it('does not activate an update while an editor is open; only the requesting tab reloads after activation', async () => {
    registration.waiting = new Worker('installed')
    const waiting = registration.waiting
    await getServiceWorkerRegistration()
    releaseGuard = registerAppTransitionGuard()
    await getPwaUpdateState().updateServiceWorker?.()
    expect(waiting.postMessage).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    releaseGuard()
    releaseGuard = undefined
    const updating = getPwaUpdateState().updateServiceWorker?.()
    await flush()
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    container.controller = waiting
    registration.waiting = null
    container.dispatchEvent(new Event('controllerchange'))
    await updating
    expect(reload).toHaveBeenCalledOnce()
  })

  it('preserves an editor opened while activation is in flight', async () => {
    registration.waiting = new Worker('installed')
    await getServiceWorkerRegistration()
    const updating = getPwaUpdateState().updateServiceWorker?.()
    await flush()
    releaseGuard = registerAppTransitionGuard()
    container.dispatchEvent(new Event('controllerchange'))
    await updating
    expect(reload).not.toHaveBeenCalled()
  })

  it('exposes a recoverable activation timeout without reloading', async () => {
    registration.waiting = new Worker('installed')
    await getServiceWorkerRegistration()
    const updating = getPwaUpdateState().updateServiceWorker?.()
    await vi.advanceTimersByTimeAsync(10_000)
    await updating
    expect(reload).not.toHaveBeenCalled()
    expect(getPwaUpdateState().error).toContain('timed out')
  })

  it('checks the release version without cache, deduplicates foreground checks, and requests the changed worker', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ buildId: `${APP_BUILD_ID}-next` })),
      )
    vi.stubGlobal('fetch', fetch)
    await Promise.all([checkForPwaUpdate(), checkForPwaUpdate()])
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      '/version.json',
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(registration.update).toHaveBeenCalledOnce()
    expect(getPwaUpdateState().needRefresh).toBe(true)
    expect(reload).not.toHaveBeenCalled()
  })

  it('keeps version check errors recoverable and avoids background/offline requests', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await checkForPwaUpdate(true)
    expect(fetch).not.toHaveBeenCalled()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    })
    await checkForPwaUpdate(true)
    expect(fetch).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    })
    await checkForPwaUpdate(true)
    expect(getPwaUpdateState().error).toContain('Could not check')
    fetch.mockResolvedValue(
      new Response(JSON.stringify({ buildId: APP_BUILD_ID })),
    )
    await checkForPwaUpdate(true)
    expect(getPwaUpdateState().error).toBeNull()
  })

  it('reports chunk recovery without discarding active work', () => {
    releaseGuard = registerAppTransitionGuard()
    reportChunkLoadFailure()
    expect(getPwaUpdateState()).toMatchObject({
      needRefresh: true,
      error: expect.stringContaining('saved'),
    })
    expect(reload).not.toHaveBeenCalled()
  })
})
