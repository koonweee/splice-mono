import type { NotificationSummary } from '../src/api/models'
import type { PendingLogout } from '../src/lib/pwa/logout-state'
import type { PwaUpdateState } from '../src/lib/pwa/service-worker'

const scenario =
  typeof location === 'undefined'
    ? ''
    : new URLSearchParams(location.search).get('state')
let needRefresh = ['update', 'update-error', 'blocked-update'].includes(
  scenario ?? '',
)
let error: string | null =
  scenario === 'error' ? 'App registration failed. Try again.' : null
let pending: PendingLogout | null =
  scenario === 'logout-pending'
    ? { id: 'workbench-only', mode: 'device' }
    : null
const listeners = new Set<(state: PwaUpdateState) => void>()
const emit = () => {
  for (const listener of listeners) listener(getPwaUpdateState())
}
export const APP_BUILD_ID = 'workbench-only'
export const getPwaUpdateState = (): PwaUpdateState => ({
  needRefresh,
  status: error ? 'failed' : needRefresh ? 'update-waiting' : 'ready',
  error,
  updateServiceWorker: async () => {
    await new Promise((resolve) => setTimeout(resolve, 2500))
    if (scenario === 'update-error')
      throw new Error('The update could not finish. Try again.')
    needRefresh = false
    emit()
    return false
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
let registrationCalls = 0
export const registerPwaServiceWorker = () => {
  if (registrationCalls++ > 0) {
    error = null
    emit()
  }
  return Promise.resolve()
}
export const getServiceWorkerRegistration = () =>
  Promise.resolve({ active: { postMessage: () => {} } })
export const checkForPwaUpdate = () => Promise.resolve()
export const reportChunkLoadFailure = () => {
  needRefresh = true
  error = 'Part of Splice could not load. Update when your work is saved.'
  emit()
}
export const applyNotificationSummaryBadge = (_summary: NotificationSummary) =>
  Promise.resolve()
export const clearAppBadge = () => Promise.resolve()
export const PENDING_LOGOUT_KEY = 'workbench:pending-logout'
export const PENDING_LOGOUT_COOKIE = 'workbench_logout_pending'
export const getPendingLogout = () => pending
export const completePendingLogout = () =>
  Promise.reject(new Error('Work in progress. Reconnect and retry.'))
export const clearPendingLogout = () => {
  pending = null
}
export const setPendingLogout = (mode: PendingLogout['mode']) => {
  pending = { id: 'workbench-only', mode }
  return pending
}
