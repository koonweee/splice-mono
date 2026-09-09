import { VisuallyHidden } from '@mantine/core'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { AppThemeProvider } from '../AppThemeProvider'
import { AppShellLayout } from '../AppShellLayout'
import { LaunchScreen } from '../loading/LaunchScreen'
import {
  PresentationProvider,
  readPresentationCookies,
  usePresentationPreferences,
} from '../../lib/presentation-preferences'
import {
  getHomeSnapshotEpoch,
  subscribeHomeSnapshot,
} from '../../lib/pwa/home-snapshot'
import {
  cachedHomeEnabled,
  isHomeLaunchUrl,
  isLocalLaunch,
} from '../../lib/pwa/launch-mode'
import {
  getHomeLaunch,
  getServerHomeLaunch,
  prepareHomeLaunch,
  subscribeHomeLaunch,
} from '../../lib/pwa/home-launch'
import { setHomeLaunchFailed } from '../../lib/pwa/home-continuity'
import {
  clearPrivateCaches,
  isPrivateUiBlocked,
  subscribeAuthBoundary,
} from '../../lib/auth-generation'
import { getPendingLogout, setPendingLogout } from '../../lib/pwa/logout-state'
import { completePendingLogout } from '../../lib/pwa/logout'
import { isZeroBalanceAccount } from '../../lib/balance-utils'
import { moneyToChartNumber } from '../../lib/money'
import { HomeContent } from './HomeContent'
import { HomePageFrame } from './HomePageFrame'
import type { HomeSnapshot } from '../../lib/pwa/home-snapshot'
import type { RefreshStatus } from '../HeaderRefreshStatus'

export function CachedHomeLaunch({ failed = false }: { failed?: boolean }) {
  const router = useRouter()
  const launch = useSyncExternalStore(
    subscribeHomeLaunch,
    getHomeLaunch,
    getServerHomeLaunch,
  )
  const snapshot = launch.snapshot
  const [online, setOnline] = useState(true)
  const blocked = useSyncExternalStore(
    subscribeAuthBoundary,
    isPrivateUiBlocked,
    () => false,
  )
  const epoch = useSyncExternalStore(
    subscribeHomeSnapshot,
    getHomeSnapshotEpoch,
    () => null,
  )
  useEffect(() => {
    if (
      !cachedHomeEnabled ||
      !isHomeLaunchUrl(new URL(location.href)) ||
      getPendingLogout()
    )
      return
    void prepareHomeLaunch()
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  const retry = () => {
    void router.invalidate()
  }
  useEffect(() => {
    if (!failed) return
    const reconnect = () => {
      void router.invalidate()
    }
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [failed, router])
  useEffect(() => {
    if (isLocalLaunch) setHomeLaunchFailed(failed)
  }, [failed])
  if (
    isLocalLaunch &&
    (launch.phase === 'reading' ||
      (snapshot && !blocked && epoch === snapshot.authEpoch))
  )
    return null
  if (!snapshot || blocked || epoch !== snapshot.authEpoch)
    return <LaunchScreen />
  return (
    <SavedHomePreview
      snapshot={snapshot}
      phase={!online ? 'offline' : failed ? 'error' : 'refreshing'}
      onRetry={retry}
    />
  )
}

/** No session/query hooks: this view can display saved data but cannot authorize work. */
export function SavedHomePreview({
  snapshot,
  phase,
  onRetry,
  onLogout,
}: {
  snapshot: HomeSnapshot
  phase: RefreshStatus['phase']
  onRetry: () => void
  onLogout?: () => void
}) {
  const cookies =
    typeof document === 'undefined'
      ? null
      : readPresentationCookies(document.cookie)
  return (
    <AppThemeProvider initialAppearance={snapshot.presentation.appearance}>
      <PresentationProvider
        initial={{
          appearance: snapshot.presentation.appearance,
          today: snapshot.endDate,
          maskBalances:
            cookies?.maskBalances ?? snapshot.presentation.maskBalances,
        }}
      >
        <SavedHomeContent
          snapshot={snapshot}
          phase={phase}
          onRetry={onRetry}
          onLogout={onLogout}
        />
      </PresentationProvider>
    </AppThemeProvider>
  )
}

function SavedHomeContent({
  snapshot,
  phase,
  onRetry,
  onLogout,
}: Parameters<typeof SavedHomePreview>[0]) {
  const { maskBalances } = usePresentationPreferences()
  const content = snapshotHomeContent(snapshot)
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
      readOnly
      onLogout={onLogout ?? logout}
      refreshStatus={{
        phase,
        lastSuccessfulAt: Math.min(
          snapshot.summary.updatedAt,
          snapshot.series?.updatedAt ?? Infinity,
        ),
      }}
      onRetryRefresh={onRetry}
    >
      <VisuallyHidden role="status">
        Saved Home as of {snapshot.endDate}. Updating; financial actions are
        unavailable.
      </VisuallyHidden>
      <HomePageFrame>
        <div inert aria-label={`Saved Home for ${snapshot.endDate}`}>
          <HomeContent
            {...content}
            balancesHidden={maskBalances}
            onAccountClick={() => undefined}
            onPeriodChange={() => undefined}
            seriesLoading={false}
          />
        </div>
      </HomePageFrame>
    </AppShellLayout>
  )
}

export function snapshotHomeContent(snapshot: HomeSnapshot) {
  const summary = snapshot.summary.data
  const account = (item: (typeof summary.assets)[number]) => ({
    ...item,
    subType: item.subType ?? undefined,
    institutionName: item.institutionName ?? undefined,
    syncedAt: item.syncedAt ?? undefined,
  })
  const assets = summary.assets.map(account)
  const liabilities = summary.liabilities.map(account)
  const visible = (items: typeof assets) =>
    items.filter(
      (item) =>
        !item.archivedAt &&
        (!snapshot.presentation.hideZeroBalanceAccounts ||
          !isZeroBalanceAccount(item)),
    )
  const dashboard = {
    netWorth: summary.netWorth,
    changeAmount: summary.changeAmount,
    changePercent: summary.changePercent,
    comparisonPeriod: snapshot.period,
    assets,
    liabilities,
    chartData:
      snapshot.series?.data.points.map((point) => ({
        date: point.date,
        label: dayjs(point.date).format('MMM D, YYYY'),
        value: moneyToChartNumber(point.netWorth),
        money: point.netWorth,
      })) ?? [],
  }
  return {
    dashboard,
    period: snapshot.period,
    visibleAssets: visible(assets),
    visibleLiabilities: visible(liabilities),
    onAccountClick: () => undefined,
    onPeriodChange: () => undefined,
    seriesLoading: false,
  }
}
