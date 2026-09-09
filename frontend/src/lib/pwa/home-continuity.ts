import { useLayoutEffect } from 'react'
import { getHomeSnapshotEpoch, subscribeHomeSnapshot } from './home-snapshot'
import { isHomeLaunchUrl, isLocalLaunch } from './launch-mode'
import type { ComponentProps } from 'react'
import type { AppShellLayout } from '../../components/AppShellLayout'
import type { HomeContent } from '../../components/pages/HomeContent'
import type { DataState } from '../../components/DataState'

export type HomeView = {
  controls: Pick<
    ComponentProps<typeof HomeContent>,
    'period' | 'onPeriodChange' | 'onAccountClick' | 'onRetrySeries'
  >
  content: ComponentProps<typeof HomeContent> | null
  state: Omit<ComponentProps<typeof DataState>, 'children'>
}
export type HomeShell = Omit<ComponentProps<typeof AppShellLayout>, 'children'>
type State = {
  home?: HomeView
  shell?: HomeShell
  epoch: string | null
  failed: boolean
}
let state: State = { epoch: null, failed: false }
const listeners = new Set<() => void>()
export const getHomeContinuity = () => state
export const subscribeHomeContinuity = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const publish = (next: State) => {
  state = next
  listeners.forEach((listener) => listener())
}
let active = isLocalLaunch
export const ownsHomePresentation = () => {
  if (active && !isHomeLaunchUrl(new URL(location.href))) active = false
  return active
}
if (typeof window !== 'undefined')
  subscribeHomeSnapshot(() => {
    if (state.epoch !== getHomeSnapshotEpoch())
      publish({ epoch: null, failed: false })
  })
export function setHomeLaunchFailed(failed: boolean) {
  if (state.failed !== failed) publish({ ...state, failed })
}
export function useHomePublication<TKey extends 'home' | 'shell'>(
  key: TKey,
  value: State[TKey],
  enabled: boolean,
) {
  useLayoutEffect(() => {
    if (!enabled) return
    publish({ ...state, [key]: value, epoch: getHomeSnapshotEpoch() })
    return () => {
      publish({ ...state, [key]: undefined })
    }
  }, [key, value, enabled])
}
