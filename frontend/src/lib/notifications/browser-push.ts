import { axios } from '../../api/axios'
import { getServiceWorkerRegistration } from '../pwa/service-worker'
import {
  assertAuthGeneration,
  getAuthGeneration,
  isPrivateUiBlocked,
} from '../auth-generation'
import {
  bindWorkerSession,
  disableWorkerSession,
  sendWorkerMessage,
} from '../pwa/worker-channel'
import { getPendingLogout } from '../pwa/logout-state'
import { withDeadline } from '../pwa/deadline'

type PushConfigResponse = {
  configured: boolean
  vapidPublicKey: string | null
}

type PushSubscriptionStatusResponse = {
  configured: boolean
  subscribed: boolean
  rebindRequired: boolean
  enrollmentId: string | null
}

const EXPLICIT_OFF_KEY = 'splice:push-explicitly-off'
const INTENT_KEY = 'splice:push-intent'
type NotificationIntent = { revision: number; stored: string | null }
let intentRevision = 0
let enableInFlight:
  | { intent: NotificationIntent; promise: Promise<void> }
  | undefined
function storedIntent(): string | null {
  try {
    return localStorage.getItem(INTENT_KEY)
  } catch {
    return null
  }
}
function currentIntent(): NotificationIntent {
  return { revision: intentRevision, stored: storedIntent() }
}
function sameIntent(intent: NotificationIntent): boolean {
  return intent.revision === intentRevision && intent.stored === storedIntent()
}
function assertIntent(intent: NotificationIntent) {
  if (!sameIntent(intent))
    throw new DOMException('Notification choice changed', 'AbortError')
}
function beginIntent(off: boolean): NotificationIntent {
  intentRevision++
  rememberOff(off)
  try {
    localStorage.setItem(INTENT_KEY, crypto.randomUUID())
  } catch {
    /* In-memory intent still fences this tab. */
  }
  return currentIntent()
}
let configCache:
  | { expires: number; promise: Promise<PushConfigResponse> }
  | undefined
function explicitlyOff() {
  try {
    return localStorage.getItem(EXPLICIT_OFF_KEY) === 'true'
  } catch {
    return false
  }
}
function rememberOff(value: boolean) {
  try {
    localStorage.setItem(EXPLICIT_OFF_KEY, String(value))
  } catch {
    /* Server revocation remains authoritative. */
  }
}
function assertCurrentIdentity(generation: number) {
  assertAuthGeneration(generation)
  if (isPrivateUiBlocked() || getPendingLogout())
    throw new Error('Session changed. Sign in again to manage notifications.')
}
let enrollmentQueue: Promise<unknown> = Promise.resolve()
function withEnrollmentLock<T>(action: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> =>
    typeof navigator.locks?.request === 'function'
      ? await navigator.locks.request('splice-push-enrollment', action)
      : await action()
  // Serialize native subscription changes in this tab even without Web Locks.
  const result = enrollmentQueue.then(run, run)
  enrollmentQueue = result.catch(() => undefined)
  return result
}

export type NotificationSupportStatus =
  | 'supported'
  | 'unsupported'
  | 'denied'
  | 'unconfigured'
  | 'install-required'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof PushManager !== 'undefined' &&
    typeof Notification !== 'undefined'
  )
}

export function getNotificationPermission():
  | NotificationPermission
  | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported'
  }

  return Notification.permission
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = `${base64String}${padding}`
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length))

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

export async function getPushConfig(): Promise<PushConfigResponse> {
  if (configCache && configCache.expires > Date.now())
    return configCache.promise
  const promise = axios<PushConfigResponse>({
    url: '/notification/push/config',
    method: 'GET',
    timeout: 10_000,
  }).catch((error: unknown) => {
    configCache = undefined
    throw error
  })
  configCache = { expires: Date.now() + 60_000, promise }
  return promise
}

export async function getCurrentPushSubscriptionStatus(
  endpoint?: string,
): Promise<PushSubscriptionStatusResponse> {
  return axios<PushSubscriptionStatusResponse>({
    url: '/notification/push/subscription/current',
    method: 'GET',
    params: endpoint ? { endpoint } : undefined,
    timeout: 10_000,
  })
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!isPushSupported()) {
    throw new Error('Browser push notifications are not supported')
  }

  return getServiceWorkerRegistration()
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    return null
  }

  return withDeadline(
    (async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return registration?.pushManager.getSubscription() ?? null
    })(),
    10_000,
    'Notification status timed out. Try again.',
  )
}

export async function loadCurrentDeviceNotificationState(): Promise<{
  supported: NotificationSupportStatus
  subscribed: boolean
  rebindRequired?: boolean
  enrollmentId?: string | null
}> {
  const generation = getAuthGeneration()
  const intent = currentIntent()
  const isAppleMobile =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone)
  if (isAppleMobile && !standalone)
    return { supported: 'install-required', subscribed: false }
  if (!isPushSupported()) {
    return { supported: 'unsupported', subscribed: false }
  }

  if (Notification.permission === 'denied') {
    return { supported: 'denied', subscribed: false }
  }

  const config = await getPushConfig()
  if (!config.configured || !config.vapidPublicKey) {
    return { supported: 'unconfigured', subscribed: false }
  }

  const subscription = await getExistingPushSubscription()
  if (!subscription) {
    return { supported: 'supported', subscribed: false }
  }

  const status = await getCurrentPushSubscriptionStatus(subscription.endpoint)
  assertCurrentIdentity(generation)
  assertIntent(intent)
  const subscribed = status.subscribed && !explicitlyOff()
  if (subscribed) {
    await bindWorkerSession(status.enrollmentId)
    assertCurrentIdentity(generation)
    assertIntent(intent)
  }
  return {
    supported: 'supported',
    subscribed,
    rebindRequired: status.rebindRequired,
    enrollmentId: status.enrollmentId,
  }
  await revokeCurrentDevicePushSubscription()
}

export async function enableCurrentDeviceNotifications(): Promise<void> {
  if (enableInFlight && sameIntent(enableInFlight.intent))
    return enableInFlight.promise
  if (!isPushSupported()) {
    throw new Error('Browser push notifications are not supported')
  }
  const intent = beginIntent(false)
  const generation = getAuthGeneration()
  // Native permission must be requested in the original click, before awaits.
  const permission =
    Notification.permission === 'granted'
      ? Promise.resolve('granted')
      : Notification.requestPermission()
  const attempt = { intent, promise: Promise.resolve() }
  attempt.promise = permission
    .then(async (result) => {
      if (result !== 'granted')
        throw new Error('Notification permission was not granted')
      assertCurrentIdentity(generation)
      assertIntent(intent)
      await withEnrollmentLock(() => enrollCurrentDevice(generation, intent))
    })
    .finally(() => {
      if (enableInFlight === attempt) enableInFlight = undefined
    })
  enableInFlight = attempt
  return attempt.promise
}

async function enrollCurrentDevice(
  generation: number,
  intent: NotificationIntent,
): Promise<void> {
  assertCurrentIdentity(generation)
  assertIntent(intent)
  const config = await getPushConfig()
  if (!config.configured || !config.vapidPublicKey)
    throw new Error('Push notifications are not configured')
  assertCurrentIdentity(generation)
  assertIntent(intent)
  const registration = await registerServiceWorker()
  // Do not activate server delivery while an old, privacy-unaware worker runs.
  await sendWorkerMessage({ type: 'PWA_CONTROL_GET' })
  assertCurrentIdentity(generation)
  assertIntent(intent)
  let existingSubscription = await withDeadline(
    registration.pushManager.getSubscription(),
    10_000,
    'Notification status timed out.',
  )
  const expectedKey = urlBase64ToUint8Array(config.vapidPublicKey)
  const actualKey = existingSubscription?.options.applicationServerKey
  if (
    actualKey &&
    Array.from(new Uint8Array(actualKey)).join(',') !==
      Array.from(expectedKey).join(',')
  ) {
    const removed = await withDeadline(
      existingSubscription!.unsubscribe(),
      10_000,
      'Old notification subscription could not be removed.',
    )
    if (!removed)
      throw new Error(
        'Old notification subscription could not be removed. Try again.',
      )
    assertCurrentIdentity(generation)
    assertIntent(intent)
    existingSubscription = null
  }
  const subscription =
    existingSubscription ??
    (await withDeadline(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          config.vapidPublicKey,
        ) as BufferSource,
      }),
      10_000,
      'Notification subscription timed out. Try again.',
    ))

  assertCurrentIdentity(generation)
  assertIntent(intent)
  const serialized = subscription.toJSON()
  const keys = serialized.keys
  if (!serialized.endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error('Browser returned an incomplete push subscription')
  }

  assertCurrentIdentity(generation)
  assertIntent(intent)
  const enrolled = await axios<{ enrollmentId: string }>({
    url: '/notification/push/subscriptions',
    method: 'POST',
    timeout: 10_000,
    data: {
      protocolVersion: 2,
      endpoint: serialized.endpoint,
      expirationTime: serialized.expirationTime ?? null,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      userAgent: navigator.userAgent,
    },
  })
  assertCurrentIdentity(generation)
  assertIntent(intent)
  await bindWorkerSession(enrolled.enrollmentId)
  assertCurrentIdentity(generation)
  assertIntent(intent)
  window.dispatchEvent(new Event('splice:notification-state-changed'))
}

/** Only the one-time legacy migration may enable push without a fresh action. */
export async function reconcileDeviceNotifications(): Promise<void> {
  const generation = getAuthGeneration()
  const intent = currentIntent()
  const assertCurrent = () => {
    assertCurrentIdentity(generation)
    assertIntent(intent)
  }
  assertCurrent()
  const state = await loadCurrentDeviceNotificationState()
  assertCurrent()
  if (
    state.rebindRequired &&
    !explicitlyOff() &&
    getNotificationPermission() === 'granted'
  ) {
    await withEnrollmentLock(async () => {
      assertCurrent()
      const current = await loadCurrentDeviceNotificationState()
      assertCurrent()
      if (current.rebindRequired && !explicitlyOff())
        await enrollCurrentDevice(generation, intent)
      else {
        await bindWorkerSession(
          current.subscribed && !explicitlyOff()
            ? (current.enrollmentId ?? null)
            : null,
        )
        assertCurrent()
      }
    })
  } else {
    await bindWorkerSession(
      state.subscribed && !explicitlyOff()
        ? (state.enrollmentId ?? null)
        : null,
    )
    assertCurrent()
  }
}

export async function disableCurrentDeviceNotifications(): Promise<void> {
  const generation = getAuthGeneration()
  const intent = beginIntent(true)
  const stillCurrent = () =>
    generation === getAuthGeneration() && sameIntent(intent)
  const assertCurrent = () => {
    assertAuthGeneration(generation)
    assertIntent(intent)
  }
  // Optional worker inspection cannot hold up the server request or native unsubscribe.
  let cleanupAllowed = true
  const workerCleanup = withDeadline(
    disableWorkerSession(() => cleanupAllowed && stillCurrent()),
    3_000,
    'Device cleanup timed out.',
  )
    .catch(() => undefined)
    .finally(() => {
      cleanupAllowed = false
    })
  await withEnrollmentLock(async () => {
    assertCurrent()
    const subscription = await getExistingPushSubscription()
    assertCurrent()
    const results = subscription
      ? await Promise.allSettled([
          axios({
            url: '/notification/push/subscriptions/current',
            method: 'DELETE',
            timeout: 10_000,
            data: { endpoint: subscription.endpoint },
          }),
          withDeadline(
            subscription.unsubscribe(),
            10_000,
            'Browser notification cleanup timed out.',
          ),
        ])
      : []
    // Settle optional cleanup before restoring badge-only worker state. A timed-out
    // cleanup loses its guard so it cannot later disable that fresh state.
    await workerCleanup
    assertCurrent()
    if (!isPrivateUiBlocked() && !getPendingLogout()) {
      await bindWorkerSession(null)
      assertCurrent()
    }
    window.dispatchEvent(new Event('splice:notification-state-changed'))
    const failure = results.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
  })
}

export async function revokeCurrentDevicePushSubscription(): Promise<void> {
  try {
    await disableCurrentDeviceNotifications()
  } catch {
    // Logout should proceed even if best-effort notification cleanup fails.
  }
}

export async function revokeAllPushSubscriptions(): Promise<void> {
  try {
    await axios({
      url: '/notification/push/subscriptions',
      method: 'DELETE',
      timeout: 10_000,
    })
  } catch {
    // Logout-all should proceed even if best-effort notification cleanup fails.
  }
}

export async function updateNewSyncedTransactionsPreference(
  enabled: boolean,
): Promise<void> {
  await axios({
    url: '/user/settings',
    method: 'PATCH',
    data: {
      notifications: {
        transactions: {
          newSyncedTransactions: enabled,
        },
      },
    },
  })
}

export async function updateBankLinkNeedsAttentionPreference(
  enabled: boolean,
): Promise<void> {
  await axios({
    url: '/user/settings',
    method: 'PATCH',
    data: {
      notifications: {
        bankLinks: {
          needsAttention: enabled,
        },
      },
    },
  })
}
