import { axios } from '../../api/axios'

const SERVICE_WORKER_PATH = '/sw.js'

type PushConfigResponse = {
  configured: boolean
  vapidPublicKey: string | null
}

type PushSubscriptionStatusResponse = {
  configured: boolean
  subscribed: boolean
}

export type NotificationSupportStatus =
  | 'supported'
  | 'unsupported'
  | 'denied'
  | 'unconfigured'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
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
  return axios<PushConfigResponse>({
    url: '/notification/push/config',
    method: 'GET',
  })
}

export async function getCurrentPushSubscriptionStatus(
  endpoint?: string,
): Promise<PushSubscriptionStatusResponse> {
  return axios<PushSubscriptionStatusResponse>({
    url: '/notification/push/subscription/current',
    method: 'GET',
    params: endpoint ? { endpoint } : undefined,
  })
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!isPushSupported()) {
    throw new Error('Browser push notifications are not supported')
  }

  return navigator.serviceWorker.register(SERVICE_WORKER_PATH)
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    return null
  }

  const registration = await navigator.serviceWorker.getRegistration()
  return registration?.pushManager.getSubscription() ?? null
}

export async function loadCurrentDeviceNotificationState(): Promise<{
  supported: NotificationSupportStatus
  subscribed: boolean
}> {
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
  return {
    supported: 'supported',
    subscribed: status.subscribed,
  }
}

export async function enableCurrentDeviceNotifications(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error('Browser push notifications are not supported')
  }

  const config = await getPushConfig()
  if (!config.configured || !config.vapidPublicKey) {
    throw new Error('Push notifications are not configured')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted')
  }

  const registration = await registerServiceWorker()
  const existingSubscription = await registration.pushManager.getSubscription()
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        config.vapidPublicKey,
      ) as BufferSource,
    }))

  const serialized = subscription.toJSON()
  const keys = serialized.keys
  if (!serialized.endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error('Browser returned an incomplete push subscription')
  }

  await axios({
    url: '/notification/push/subscriptions',
    method: 'POST',
    data: {
      endpoint: serialized.endpoint,
      expirationTime: serialized.expirationTime ?? null,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      userAgent: navigator.userAgent,
    },
  })
}

export async function disableCurrentDeviceNotifications(): Promise<void> {
  const subscription = await getExistingPushSubscription()
  if (!subscription) {
    return
  }

  await axios({
    url: '/notification/push/subscriptions/current',
    method: 'DELETE',
    data: { endpoint: subscription.endpoint },
  })
  await subscription.unsubscribe()
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
