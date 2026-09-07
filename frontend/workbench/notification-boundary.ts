/** No permission prompts, device subscriptions, service workers or network. */
let subscribed = false
export const loadCurrentDeviceNotificationState = () =>
  Promise.resolve({ supported: 'supported' as const, subscribed })
export const enableCurrentDeviceNotifications = () => {
  subscribed = true
  return Promise.resolve()
}
export const disableCurrentDeviceNotifications = () => {
  subscribed = false
  return Promise.resolve()
}
