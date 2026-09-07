import type { NotificationSupportStatus } from '../src/lib/notifications/browser-push'

/** No permission prompts, device subscriptions, workers, network, cookies or storage. */
let subscribed = false
let attempts = 0
const scenario = () =>
  typeof location === 'undefined'
    ? ''
    : new URLSearchParams(location.search).get('state')
export const loadCurrentDeviceNotificationState = (): Promise<{
  supported: NotificationSupportStatus
  subscribed: boolean
  rebindRequired?: boolean
  enrollmentId?: string | null
}> => {
  if (scenario() === 'notification-registering') return new Promise(() => {})
  if (scenario() === 'notification-error' && attempts++ === 0)
    return Promise.reject(
      new Error('Device status could not be checked. Try again.'),
    )
  const support = scenario()?.replace('notification-', '')
  if (
    ['denied', 'unconfigured', 'install-required', 'unsupported'].includes(
      support ?? '',
    )
  )
    return Promise.resolve({
      supported: support as NotificationSupportStatus,
      subscribed: false,
    })
  return Promise.resolve({
    supported: 'supported',
    subscribed,
    rebindRequired: scenario() === 'notification-rebind',
    enrollmentId: subscribed ? 'workbench-enrollment' : null,
  })
}
export const enableCurrentDeviceNotifications = (): Promise<void> => {
  if (scenario() === 'notification-enabling') return new Promise(() => {})
  subscribed = true
  return Promise.resolve()
}
export const disableCurrentDeviceNotifications = () => {
  subscribed = false
  return Promise.resolve()
}
export const reconcileDeviceNotifications = () => Promise.resolve()
export const getPushConfig = () =>
  Promise.resolve({ configured: true, vapidPublicKey: 'workbench-only' })
