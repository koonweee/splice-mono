import type { RegisterSWOptions } from 'vite-plugin-pwa/types'

export type PwaUpdateState = {
  needRefresh: boolean
  updateServiceWorker: (() => Promise<void>) | null
}

type RegisterSW = (
  options?: RegisterSWOptions,
) => (reloadPage?: boolean) => Promise<void>

type PwaRegistrationOptions = {
  onOfflineReady?: () => void
  onRegisterError?: (error: unknown) => void
}

type PwaUpdateListener = (state: PwaUpdateState) => void

const listeners = new Set<PwaUpdateListener>()
const PWA_CACHE_SCHEMA_KEY = 'splice-pwa-cache-schema'
const PWA_CACHE_SCHEMA_VERSION = '2'
const LEGACY_APP_SHELL_CACHE = 'splice-app-shell-v1'

let loadRegisterSW: () => Promise<RegisterSW> = async () => {
  const pwaModule = await import('virtual:pwa-register')

  return pwaModule.registerSW
}

let registrationStarted = false
let registrationPromise: Promise<void> | null = null
let serviceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration> | null =
  null
let needRefresh = false
let updateServiceWorker: (() => Promise<void>) | null = null

function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator
}

async function clearLegacyPwaCaches(): Promise<void> {
  if (
    typeof window === 'undefined' ||
    !('caches' in window) ||
    window.localStorage.getItem(PWA_CACHE_SCHEMA_KEY) ===
      PWA_CACHE_SCHEMA_VERSION
  ) {
    return
  }

  const cacheNames = await window.caches.keys()
  const legacyCacheNames = cacheNames.filter(
    (cacheName) =>
      cacheName === LEGACY_APP_SHELL_CACHE ||
      cacheName.startsWith('workbox-precache'),
  )

  await Promise.all(
    legacyCacheNames.map((cacheName) => window.caches.delete(cacheName)),
  )
  window.localStorage.setItem(PWA_CACHE_SCHEMA_KEY, PWA_CACHE_SCHEMA_VERSION)
}

function emitUpdateState() {
  const state = getPwaUpdateState()

  listeners.forEach((listener) => {
    listener(state)
  })
}

export function getPwaUpdateState(): PwaUpdateState {
  return {
    needRefresh,
    updateServiceWorker,
  }
}

export function subscribeToPwaUpdates(listener: PwaUpdateListener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export async function registerPwaServiceWorker(
  options: PwaRegistrationOptions = {},
): Promise<void> {
  if (!isServiceWorkerSupported() || registrationStarted) {
    return registrationPromise ?? Promise.resolve()
  }

  registrationStarted = true
  registrationPromise = clearLegacyPwaCaches()
    .catch(() => undefined)
    .then(() => loadRegisterSW())
    .then((registerSW) => {
      const update = registerSW({
        immediate: true,
        onNeedRefresh() {
          needRefresh = true
          emitUpdateState()
        },
        onOfflineReady() {
          options.onOfflineReady?.()
        },
        onRegisterError(error) {
          options.onRegisterError?.(error)
        },
      })

      updateServiceWorker = () => update(true)
      emitUpdateState()
    })
    .catch((error: unknown) => {
      registrationStarted = false
      registrationPromise = null
      options.onRegisterError?.(error)

      throw error
    })

  return registrationPromise
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!isServiceWorkerSupported()) {
    throw new Error('Service workers are not supported')
  }

  await registerPwaServiceWorker()

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration ?? navigator.serviceWorker.ready)
  }

  return serviceWorkerRegistrationPromise
}

export function setRegisterSWLoaderForTests(
  loader: () => Promise<RegisterSW>,
): void {
  loadRegisterSW = loader
  resetPwaServiceWorkerStateForTests()
}

export function resetPwaServiceWorkerStateForTests(): void {
  listeners.clear()
  registrationStarted = false
  registrationPromise = null
  serviceWorkerRegistrationPromise = null
  needRefresh = false
  updateServiceWorker = null
}
