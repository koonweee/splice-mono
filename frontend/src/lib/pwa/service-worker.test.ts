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
  scriptURL = new URL('/sw.js', window.location.href).href
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
  scope = new URL('/', window.location.href).href
  active: Worker | null = new Worker()
  installing: Worker | null = null
  waiting: Worker | null = null
  update = vi.fn().mockResolvedValue(undefined)
}
class Container extends EventTarget {
  controller: Worker | null = new Worker()
  register = vi.fn()
  getRegistration = vi.fn().mockResolvedValue(undefined)
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

  it('does not latch an update while the first worker passes through waiting', async () => {
    const worker = new Worker('installing')
    registration.active = null
    registration.installing = worker
    container.controller = null
    const ready = getServiceWorkerRegistration()
    await flush()
    registration.installing = null
    registration.waiting = worker
    worker.change('installed')
    expect(getPwaUpdateState()).toMatchObject({
      needRefresh: false,
      status: 'registering',
    })
    registration.waiting = null
    registration.active = worker
    container.controller = worker
    worker.change('activated')
    container.dispatchEvent(new Event('controllerchange'))
    await ready
    expect(getPwaUpdateState()).toMatchObject({
      needRefresh: false,
      status: 'ready',
    })
    expect(reload).not.toHaveBeenCalled()
  })

  it('still reports a genuine waiting replacement on an uncontrolled page', async () => {
    container.controller = null
    registration.waiting = new Worker('installed')
    await getServiceWorkerRegistration()
    expect(getPwaUpdateState()).toMatchObject({
      needRefresh: true,
      status: 'update-waiting',
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

  it('reuses an installed app worker even when network registration and legacy cache cleanup stall', async () => {
    container.getRegistration.mockResolvedValue(registration)
    container.register.mockReturnValue(new Promise(() => {}))
    vi.mocked(caches.delete).mockReturnValue(new Promise(() => {}))
    registration.waiting = new Worker('installed')
    expect(await getServiceWorkerRegistration()).toBe(registration)
    expect(container.register).not.toHaveBeenCalled()
    expect(getPwaUpdateState()).toMatchObject({
      status: 'update-waiting',
      needRefresh: true,
      error: null,
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['scope', 'script'])(
    'does not reuse an unrelated registration with a different %s',
    async (difference) => {
      const unrelated = new Registration()
      if (difference === 'scope') unrelated.scope += 'other/'
      else unrelated.active!.scriptURL += '?other'
      container.getRegistration.mockResolvedValue(unrelated)
      expect(await getServiceWorkerRegistration()).toBe(registration)
      expect(container.register).toHaveBeenCalledOnce()
    },
  )

  it.each(['rejects', 'stalls'])(
    'falls back to registration when the installed-worker lookup %s',
    async (failure) => {
      container.getRegistration.mockImplementation(() =>
        failure === 'rejects'
          ? Promise.reject(new Error('Storage unavailable'))
          : new Promise(() => {}),
      )
      const ready = getServiceWorkerRegistration()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await ready).toBe(registration)
      expect(container.register).toHaveBeenCalledOnce()
      expect(getPwaUpdateState().error).toBeNull()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('gives first installation its own deadline after a slow registration', async () => {
    const registered = deferred<Registration>()
    container.register.mockReturnValue(registered.promise)
    const worker = new Worker('installing')
    registration.active = null
    registration.installing = worker
    const ready = getServiceWorkerRegistration()
    await vi.advanceTimersByTimeAsync(9_000)
    registered.resolve(registration)
    await vi.advanceTimersByTimeAsync(31_000)
    expect(getPwaUpdateState().status).toBe('registering')
    registration.active = worker
    registration.installing = null
    worker.change('activated')
    expect(await ready).toBe(registration)
    expect(getPwaUpdateState().status).toBe('ready')
    expect(vi.getTimerCount()).toBe(0)
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
    await vi.advanceTimersByTimeAsync(45_000)
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
    expect(await getPwaUpdateState().updateServiceWorker?.()).toBe(false)
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
    expect(await updating).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('waits through a native 31-second activation delay and deduplicates repeated Update clicks', async () => {
    const waiting = new Worker('installed')
    registration.waiting = waiting
    await getServiceWorkerRegistration()
    const updating = getPwaUpdateState().updateServiceWorker?.()
    await vi.advanceTimersByTimeAsync(31_000)
    expect(reload).not.toHaveBeenCalled()
    expect(getPwaUpdateState().error).toBeNull()
    const repeated = getPwaUpdateState().updateServiceWorker?.()
    await flush()
    expect(waiting.postMessage).toHaveBeenCalledOnce()
    container.controller = waiting
    registration.waiting = null
    container.dispatchEvent(new Event('controllerchange'))
    await Promise.all([updating, repeated])
    expect(reload).toHaveBeenCalledOnce()
    container.dispatchEvent(new Event('controllerchange'))
    await vi.advanceTimersByTimeAsync(45_000)
    expect(reload).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves an editor opened during a delayed activation until another explicit Update', async () => {
    registration.waiting = new Worker('installed')
    await getServiceWorkerRegistration()
    const updating = getPwaUpdateState().updateServiceWorker?.()
    await vi.advanceTimersByTimeAsync(20_000)
    releaseGuard = registerAppTransitionGuard()
    await vi.advanceTimersByTimeAsync(11_000)
    container.controller = registration.waiting
    registration.waiting = null
    container.dispatchEvent(new Event('controllerchange'))
    await updating
    expect(reload).not.toHaveBeenCalled()
    releaseGuard()
    releaseGuard = undefined
    await vi.advanceTimersByTimeAsync(45_000)
    expect(reload).not.toHaveBeenCalled()
    await getPwaUpdateState().updateServiceWorker?.()
    expect(reload).toHaveBeenCalledOnce()
  })

  it.each(['before retry', 'after retry'])(
    'times out at 45 seconds without a late forced reload and recovers when activation arrives %s',
    async (activation) => {
      const waiting = new Worker('installed')
      registration.waiting = waiting
      await getServiceWorkerRegistration()
      const updating = getPwaUpdateState().updateServiceWorker?.()
      await vi.advanceTimersByTimeAsync(44_999)
      expect(getPwaUpdateState().error).toBeNull()
      expect(reload).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      await updating
      expect(reload).not.toHaveBeenCalled()
      expect(getPwaUpdateState().error).toContain('activation timed out')
      expect(vi.getTimerCount()).toBe(0)
      const activate = () => {
        container.controller = waiting
        registration.waiting = null
        container.dispatchEvent(new Event('controllerchange'))
      }
      if (activation === 'before retry') {
        activate()
        await flush()
        expect(reload).not.toHaveBeenCalled()
      }
      const retry = getPwaUpdateState().updateServiceWorker?.()
      await flush()
      if (activation === 'after retry') {
        expect(waiting.postMessage).toHaveBeenCalledTimes(2)
        expect(reload).not.toHaveBeenCalled()
        activate()
      }
      await retry
      expect(reload).toHaveBeenCalledOnce()
      container.dispatchEvent(new Event('controllerchange'))
      await vi.advanceTimersByTimeAsync(45_000)
      expect(reload).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('checks the release version without cache, deduplicates foreground checks, and requests the changed worker', async () => {
    container.getRegistration.mockResolvedValue(registration)
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
    expect(container.register).not.toHaveBeenCalled()
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
