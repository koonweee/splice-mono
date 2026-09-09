import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useRouter } from '@tanstack/react-router'
import { VisuallyHidden } from '@mantine/core'
import { AppShellLayout } from '../AppShellLayout'
import { DataState } from '../DataState'
import {
  getHomeLaunch,
  getServerHomeLaunch,
  subscribeHomeLaunch,
} from '../../lib/pwa/home-launch'
import {
  getHomeContinuity,
  ownsHomePresentation,
  subscribeHomeContinuity,
} from '../../lib/pwa/home-continuity'
import {
  getHomeSnapshotEpoch,
  subscribeHomeSnapshot,
} from '../../lib/pwa/home-snapshot'
import {
  clearPrivateCaches,
  isPrivateUiBlocked,
  subscribeAuthBoundary,
} from '../../lib/auth-generation'
import { getPendingLogout, setPendingLogout } from '../../lib/pwa/logout-state'
import { completePendingLogout } from '../../lib/pwa/logout'
import { usePresentationPreferences } from '../../lib/presentation-preferences'
import { retainLiveHomeContent } from '../../lib/pwa/home-retained-view'
import { snapshotHomeContent } from './CachedHomeLaunch'
import { HomeContent } from './HomeContent'
import { HomePageFrame } from './HomePageFrame'
import type { HomeView } from '../../lib/pwa/home-continuity'

/** Stable, data-only Home host. Verified publishers supply live inputs/actions. */
export function HomeContinuityHost() {
  useLocation() // Discard the presentation immediately on route changes.
  const router = useRouter()
  const launch = useSyncExternalStore(
    subscribeHomeLaunch,
    getHomeLaunch,
    getServerHomeLaunch,
  )
  const view = useSyncExternalStore(
    subscribeHomeContinuity,
    getHomeContinuity,
    getHomeContinuity,
  )
  const epoch = useSyncExternalStore(
    subscribeHomeSnapshot,
    getHomeSnapshotEpoch,
    () => null,
  )
  const blocked = useSyncExternalStore(
    subscribeAuthBoundary,
    isPrivateUiBlocked,
    () => false,
  )
  const { maskBalances } = usePresentationPreferences()
  const retained = useRef<{
    epoch: string | null
    content: HomeView['content']
  } | null>(null)
  const handedOff = useRef<string | null | undefined>(undefined)
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  )
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  if (!ownsHomePresentation() || blocked || getPendingLogout()) {
    retained.current = null
    return null
  }
  if (retained.current?.epoch !== epoch) retained.current = null
  const snapshot = launch.snapshot?.authEpoch === epoch ? launch.snapshot : null
  const savedContent = snapshot
    ? { ...snapshotHomeContent(snapshot), balancesHidden: maskBalances }
    : null
  const waitingForSeries =
    handedOff.current !== epoch &&
    snapshot &&
    view.home?.content?.seriesLoading &&
    !view.home.content.seriesError &&
    !(
      view.home.content.chartDisplayData ??
      view.home.content.dashboard.chartData
    ).length
  const live =
    view.epoch === epoch && view.home && view.shell && !waitingForSeries
      ? view
      : null
  if (!snapshot && !live) return null
  const content = live?.home
    ? retainLiveHomeContent(
        live.home,
        retained.current?.content ??
          (handedOff.current !== epoch && snapshot ? savedContent : null),
      )
    : handedOff.current !== epoch && snapshot
      ? savedContent
      : (retained.current?.content ?? null)
  if (live && content) {
    retained.current = { epoch, content }
    handedOff.current = epoch
  }
  const logout = () => {
    setPendingLogout('device')
    clearPrivateCaches()
    void completePendingLogout()
      .catch(() => false)
      .finally(() => window.location.replace('/?login=true'))
  }
  return (
    <AppShellLayout
      pathname="/home"
      readOnly={!live}
      onLogout={logout}
      refreshStatus={{
        phase: !online ? 'offline' : view.failed ? 'error' : 'refreshing',
        lastSuccessfulAt: snapshot
          ? Math.min(
              snapshot.summary.updatedAt,
              snapshot.series?.updatedAt ?? Infinity,
            )
          : null,
      }}
      onRetryRefresh={() => {
        void router.invalidate()
      }}
      {...live?.shell}
    >
      {!live && snapshot && (
        <VisuallyHidden role="status">
          Saved Home as of {snapshot.endDate}. Updating; financial actions are
          unavailable.
        </VisuallyHidden>
      )}
      <HomePageFrame>
        <DataState
          loadingFallback={null}
          {...live?.home?.state}
          hasData={Boolean(content)}
        >
          <div
            inert={!live}
            aria-label={
              !live && snapshot
                ? `Saved Home for ${snapshot.endDate}`
                : undefined
            }
          >
            {content && (
              <HomeContent {...content} balancesHidden={maskBalances} />
            )}
          </div>
        </DataState>
      </HomePageFrame>
    </AppShellLayout>
  )
}
