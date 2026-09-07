import type { PwaUpdateState } from '../src/lib/pwa/service-worker'

let needRefresh =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('state') === 'update'
const listeners = new Set<(state: PwaUpdateState) => void>()
export const getPwaUpdateState = (): PwaUpdateState => ({
  needRefresh,
  updateServiceWorker: () => {
    needRefresh = false
    for (const listener of listeners) listener(getPwaUpdateState())
    return Promise.resolve()
  },
})
export const subscribeToPwaUpdates = (
  listener: (state: PwaUpdateState) => void,
) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const registerPwaServiceWorker = () => Promise.resolve()
export const isAppBadgeSupported = () => false
export const refreshUncategorizedTransactionBadge = () => Promise.resolve()
export const clearAppBadge = () => Promise.resolve()
