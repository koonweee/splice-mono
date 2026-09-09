import { isAppTransitionBlocked } from './app-transition'
import { fetchWithDeadline, withDeadline } from './deadline'

declare const __SPLICE_BUILD_ID__: string
export const APP_BUILD_ID =
  typeof __SPLICE_BUILD_ID__ === 'string' ? __SPLICE_BUILD_ID__ : 'development'
export type PwaRegistrationStatus =
  | 'unsupported'
  | 'registering'
  | 'ready'
  | 'failed'
  | 'update-waiting'
export type PwaUpdateState = {
  needRefresh: boolean
  /** True means reload was dispatched; keep the action pending until navigation. */
  updateServiceWorker: (() => Promise<boolean | void>) | null
  status?: PwaRegistrationStatus
  error?: string | null
}
type PwaRegistrationOptions = {
  onOfflineReady?: () => void
  onRegisterError?: (error: unknown) => void
}
const listeners = new Set<(state: PwaUpdateState) => void>()
let registrationPromise: Promise<ServiceWorkerRegistration> | undefined
let registration: ServiceWorkerRegistration | undefined
let attempt = 0
let needRefresh = false
let status: PwaRegistrationStatus = 'unsupported'
let error: string | null = null
let lastVersionCheck = 0
let updatePromise: Promise<boolean> | undefined
let cleanupListeners: Array<() => void> = []
export const pwaNavigation = { reload: () => window.location.reload() }
function supported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    (!import.meta.env.DEV || import.meta.env.MODE === 'test')
  )
}
function emit() {
  for (const listener of listeners) listener(getPwaUpdateState())
}
export function getPwaUpdateState(): PwaUpdateState {
  return {
    needRefresh,
    status,
    error,
    updateServiceWorker: registration ? applyUpdate : null,
  }
}
export function subscribeToPwaUpdates(
  listener: (state: PwaUpdateState) => void,
) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function listen(target: EventTarget, event: string, listener: () => void) {
  target.addEventListener(event, listener)
  cleanupListeners.push(() => target.removeEventListener(event, listener))
}
function hasWaitingUpdate(current: ServiceWorkerRegistration) {
  // First install can briefly occupy `waiting` before becoming active. Only a
  // distinct existing worker makes this a replacement that needs an app reload.
  // An uncontrolled page can still have an active worker and a genuine update.
  return Boolean(
    current.active && current.waiting && current.active !== current.waiting,
  )
}
function watchRegistration(current: ServiceWorkerRegistration, token: number) {
  const hadController = Boolean(navigator.serviceWorker.controller)
  const changed = () => {
    if (token !== attempt) return
    if (hasWaitingUpdate(current)) {
      needRefresh = true
      status = 'update-waiting'
      emit()
    }
  }
  const installing = () => {
    if (current.installing) listen(current.installing, 'statechange', changed)
    changed()
  }
  listen(current, 'updatefound', installing)
  // Controller changes never reload other tabs. Only applyUpdate owns reload.
  listen(navigator.serviceWorker, 'controllerchange', () => {
    if (
      token === attempt &&
      hadController &&
      navigator.serviceWorker.controller
    ) {
      needRefresh = true
      emit()
    }
  })
  installing()
}
async function activeRegistration(current: ServiceWorkerRegistration) {
  if (current.active?.state === 'activated') return current
  await new Promise<void>((resolve, reject) => {
    const workers = [
      current.installing,
      current.waiting,
      current.active,
    ].filter(Boolean) as Array<ServiceWorker>
    const changed = () => {
      if (current.active?.state === 'activated') {
        cleanup()
        resolve()
      } else if (
        workers.length &&
        workers.every((worker) => worker.state === 'redundant')
      ) {
        cleanup()
        reject(new Error('App installation failed. Try again.'))
      }
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('App installation timed out. Try again.'))
    }, 45_000)
    function cleanup() {
      clearTimeout(timer)
      workers.forEach((worker) =>
        worker.removeEventListener('statechange', changed),
      )
      navigator.serviceWorker.removeEventListener('controllerchange', changed)
    }
    workers.forEach((worker) => worker.addEventListener('statechange', changed))
    navigator.serviceWorker.addEventListener('controllerchange', changed)
    changed()
  })
  return current
}
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!supported())
    throw new Error('Installed app features are unavailable in this browser.')
  if (registrationPromise) return registrationPromise
  const token = ++attempt
  cleanupListeners.forEach((cleanup) => cleanup())
  cleanupListeners = []
  status = 'registering'
  error = null
  emit()
  const promise = (async () => {
    // Legacy cleanup must not hold up an already installed app's readiness.
    if ('caches' in window)
      void window.caches.delete('splice-app-shell-v1').catch(() => false)
    const existing = await withDeadline(
      navigator.serviceWorker.getRegistration('/'),
      10_000,
      'Could not find the installed app worker. Try again.',
    ).catch(() => undefined)
    if (token !== attempt) throw new Error('App registration was superseded.')
    // register() can trigger a network update check. An installed worker is
    // already usable; checkForPwaUpdate handles release checks separately.
    const reusable =
      existing?.scope === new URL('/', window.location.href).href &&
      existing.active?.scriptURL ===
        new URL('/sw.js', window.location.href).href &&
      existing.active.state === 'activated'
    const current = reusable
      ? existing
      : await withDeadline(
          navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none',
          }),
          10_000,
          'App registration timed out. Try again.',
        )
    if (token !== attempt) throw new Error('App registration was superseded.')
    watchRegistration(current, token)
    await activeRegistration(current)
    if (token !== attempt) throw new Error('App registration was superseded.')
    registration = current
    status = hasWaitingUpdate(current) ? 'update-waiting' : 'ready'
    needRefresh ||= hasWaitingUpdate(current)
    emit()
    return current
  })().catch((cause: unknown) => {
    if (token === attempt) {
      attempt += 1
      cleanupListeners.forEach((cleanup) => cleanup())
      cleanupListeners = []
      registrationPromise = undefined
      status = 'failed'
      error =
        cause instanceof Error
          ? cause.message
          : 'App registration failed. Try again.'
      emit()
    }
    throw cause
  })
  registrationPromise = promise
  return promise
}
export async function registerPwaServiceWorker(
  options: PwaRegistrationOptions = {},
) {
  if (!supported()) return
  try {
    await getServiceWorkerRegistration()
    options.onOfflineReady?.()
  } catch (cause) {
    options.onRegisterError?.(cause)
    throw cause
  }
}
export async function checkForPwaUpdate(force = false) {
  if (
    !supported() ||
    navigator.onLine === false ||
    document.visibilityState === 'hidden'
  )
    return
  if (!force && Date.now() - lastVersionCheck < 60_000) return
  lastVersionCheck = Date.now()
  try {
    const current = await getServiceWorkerRegistration()
    const response = await fetchWithDeadline('/version.json', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
    if (!response.ok)
      throw new Error('Could not check for app updates. Try again.')
    const version: unknown = await withDeadline(
      response.json(),
      5_000,
      'Update check timed out.',
    )
    if (
      !version ||
      typeof version !== 'object' ||
      !('buildId' in version) ||
      typeof version.buildId !== 'string'
    )
      throw new Error('Invalid app version response.')
    if (version.buildId !== APP_BUILD_ID) {
      needRefresh = true
      await withDeadline(
        current.update(),
        10_000,
        'Update download timed out. Try again.',
      )
    }
    error = null
    emit()
  } catch (cause) {
    error =
      cause instanceof Error
        ? cause.message
        : 'Could not check for app updates.'
    emit()
  }
}
async function applyUpdate(): Promise<boolean> {
  if (updatePromise) return updatePromise
  if (isAppTransitionBlocked()) return false
  updatePromise = (async () => {
    error = null
    emit()
    if (navigator.onLine === false)
      throw new Error('Reconnect before updating Splice.')
    const current = await getServiceWorkerRegistration()
    if (!current.waiting) {
      await withDeadline(
        current.update(),
        10_000,
        'Update download timed out. Try again.',
      )
      if (current.installing) {
        let cleanup = () => {}
        await withDeadline(
          new Promise<void>((resolve, reject) => {
            const worker = current.installing!
            const changed = () => {
              if (
                worker.state === 'installed' ||
                worker.state === 'redundant'
              ) {
                worker.removeEventListener('statechange', changed)
                if (worker.state === 'installed') resolve()
                else reject(new Error('Update installation failed. Try again.'))
              }
            }
            cleanup = () => worker.removeEventListener('statechange', changed)
            worker.addEventListener('statechange', changed)
            changed()
          }),
          10_000,
          'Update installation timed out.',
        ).finally(() => cleanup())
      }
    }
    if (isAppTransitionBlocked()) return false
    if (current.waiting) {
      await new Promise<void>((resolve, reject) => {
        const done = () => {
          clearTimeout(timer)
          navigator.serviceWorker.removeEventListener('controllerchange', done)
          resolve()
        }
        // An outgoing worker restarted by an in-flight request can need the
        // browser's 30-second idle window before the waiting worker activates.
        const timer = setTimeout(() => {
          navigator.serviceWorker.removeEventListener('controllerchange', done)
          reject(new Error('Update activation timed out. Try again.'))
        }, 45_000)
        navigator.serviceWorker.addEventListener('controllerchange', done)
        current.waiting?.postMessage({ type: 'SKIP_WAITING' })
      })
    }
    if (isAppTransitionBlocked()) return false
    pwaNavigation.reload()
    return true
  })()
    .catch((cause: unknown) => {
      error =
        cause instanceof Error
          ? cause.message
          : 'Could not apply update. Try again.'
      emit()
      return false
    })
    .finally(() => {
      updatePromise = undefined
    })
  return updatePromise
}
export function reportChunkLoadFailure() {
  needRefresh = true
  error = 'Part of Splice could not load. Update when your work is saved.'
  emit()
}
export function resetPwaServiceWorkerStateForTests() {
  attempt += 1
  cleanupListeners.forEach((cleanup) => cleanup())
  cleanupListeners = []
  listeners.clear()
  registrationPromise = undefined
  registration = undefined
  status = 'unsupported'
  error = null
  needRefresh = false
  lastVersionCheck = 0
  updatePromise = undefined
}
