import {
  getHomeSnapshotEpoch,
  readHomeSnapshot,
  subscribeHomeSnapshot,
} from './home-snapshot'
import { cachedHomeEnabled, isHomeLaunchUrl } from './launch-mode'
import { getPendingLogout } from './logout-state'
import type { HomeSnapshot } from './home-snapshot'

type LaunchState =
  | { phase: 'reading'; snapshot: null }
  | { phase: 'missing'; snapshot: null }
  | { phase: 'available'; snapshot: HomeSnapshot }
const missing: LaunchState = { phase: 'missing', snapshot: null }
let state: LaunchState = missing
let promise: Promise<HomeSnapshot | null> | undefined
let epoch: string | null | undefined
const listeners = new Set<() => void>()
const publish = (next: LaunchState) => {
  state = next
  listeners.forEach((listener) => listener())
}
export const subscribeHomeLaunch = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const getHomeLaunch = () => state
export const getServerHomeLaunch = () => missing

export function prepareHomeLaunch() {
  if (
    typeof window === 'undefined' ||
    !cachedHomeEnabled ||
    !isHomeLaunchUrl(new URL(location.href)) ||
    getPendingLogout()
  )
    return Promise.resolve(null)
  const current = getHomeSnapshotEpoch()
  if (promise && epoch === current) return promise
  epoch = current
  publish({ phase: 'reading', snapshot: null })
  promise = readHomeSnapshot().then((snapshot) => {
    if (
      epoch !== current ||
      getHomeSnapshotEpoch() !== current ||
      getPendingLogout()
    )
      return null
    publish(snapshot ? { phase: 'available', snapshot } : missing)
    return snapshot
  })
  return promise
}
if (typeof window !== 'undefined') {
  subscribeHomeSnapshot(() => {
    if (epoch !== getHomeSnapshotEpoch()) {
      epoch = undefined
      promise = undefined
      publish(missing)
    }
  })
}
