import { useEffect, useState } from 'react'
import { Button, Group, Stack, Text } from '@mantine/core'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useLocation,
  useRouter,
} from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { NotificationMenu } from '../src/components/notifications/NotificationMenu'
import {
  CachedHomeLaunch,
  SavedHomePreview,
} from '../src/components/pages/CachedHomeLaunch'
import { TimePeriod } from '../src/lib/types'
import { AppShellLayout } from '../src/components/AppShellLayout'
import { Route as LandingRoute } from '../src/routes/index'
import { Route as HomeRoute } from '../src/routes/_authed/home'
import { Route as AccountsRoute } from '../src/routes/_authed/accounts'
import { Route as TransactionsRoute } from '../src/routes/_authed/transactions'
import { Route as AnalysisRoute } from '../src/routes/_authed/analysis'
import { Route as SettingsRoute } from '../src/routes/_authed/settings'
import { RoutePendingSkeleton } from '../src/components/pages/RoutePendingSkeleton'
import { LaunchScreen } from '../src/components/loading/LaunchScreen'
import { validateSettingsSearch } from '../src/lib/route-search'
import { invalidateFamilies } from '../src/lib/query-invalidation'
import { appearanceFromSearch } from './preferences'
import { fixtureDashboard } from './page-fixtures'
import { waitForRoute } from './loading-gates'
import { simulateLogout } from './auth-boundary'
import { fixturePresentation } from './runtime-boundaries'
import { setTransactionRefreshFailure } from './fixture-api'
import type { HomeSnapshot } from '../src/lib/pwa/home-snapshot'
import type { AnyRoute } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { ExampleProps } from './examples'
import type { RefreshStatus } from '../src/components/HeaderRefreshStatus'

function CachedHomeExample({ state, masked }: ExampleProps) {
  const [router] = useState(() => {
    const root = createRootRouteWithContext<Record<string, never>>()({
      component: () => {
        const [retrying, setRetrying] = useState(false)
        useEffect(() => {
          if (!retrying) return
          const timer = window.setTimeout(() => setRetrying(false), 2500)
          return () => window.clearTimeout(timer)
        }, [retrying])
        if (state === 'no-snapshot') return <CachedHomeLaunch />
        const data = fixtureDashboard('month', state === 'empty')
        const updatedAt = Date.parse('2026-09-06T12:00:00Z')
        const snapshot: HomeSnapshot = {
          schemaVersion: 1,
          identity: 'synthetic-preview',
          authEpoch: 'workbench',
          savedAt: updatedAt,
          period: TimePeriod.month,
          endDate: data.summary.endDate,
          presentation: {
            currency: 'USD',
            timezone: 'UTC',
            appearance: appearanceFromSearch(window.location.search).preference,
            maskBalances: masked || state === 'masked',
            hideZeroBalanceAccounts: false,
          },
          summary: { data: data.summary, updatedAt },
          series:
            state === 'missing-series'
              ? null
              : { data: data.series, updatedAt },
        }
        return (
          <SavedHomePreview
            snapshot={snapshot}
            phase={
              retrying
                ? 'refreshing'
                : state === 'offline'
                  ? 'offline'
                  : state === 'refresh-failure'
                    ? 'error'
                    : 'refreshing'
            }
            onRetry={() => setRetrying(true)}
            onLogout={simulateLogout}
          />
        )
      },
    })
    return createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: {},
    })
  })
  return <RouterProvider router={router} />
}

function PageFrame() {
  const location = useLocation()
  const router = useRouter()
  const state = new URLSearchParams(window.location.search).get('state')
  const [retrying, setRetrying] = useState(false)
  useEffect(() => {
    if (!retrying) return
    const timer = window.setTimeout(() => setRetrying(false), 2500)
    return () => window.clearTimeout(timer)
  }, [retrying])
  const phase: RefreshStatus['phase'] =
    retrying || state === 'retrying' || state === 'hourly-refreshing'
      ? 'refreshing'
      : state === 'offline'
        ? 'offline'
        : state === 'refresh-failure'
          ? 'error'
          : 'idle'
  const showRefreshScenario =
    location.pathname === '/transactions' &&
    new URLSearchParams(window.location.search).get('state') === 'refresh-error'
  return (
    <AppShellLayout
      pathname={location.pathname}
      refreshStatus={{ phase, lastSuccessfulAt: Date.UTC(2026, 8, 8, 10, 0) }}
      onRetryRefresh={() => setRetrying(true)}
      onLogout={simulateLogout}
      headerActions={
        <NotificationMenu
          onNavigate={(url) => {
            void router.navigate({ href: url })
          }}
        />
      }
    >
      {showRefreshScenario && <TransactionRefreshScenario />}
      <Outlet />
    </AppShellLayout>
  )
}

function TransactionRefreshScenario() {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const refresh = async (failing: boolean) => {
    setPending(true)
    setTransactionRefreshFailure(failing)
    try {
      await invalidateFamilies(queryClient, ['transactions'])
    } finally {
      setPending(false)
    }
  }
  return (
    <Stack gap="xs" mb="md">
      <Text size="sm">
        Workbench scenario: enable bulk edit and select a transaction, then fail
        its refresh. Restore reads to check recovery without losing selection.
      </Text>
      <Group>
        <Button disabled={pending} onClick={() => void refresh(true)}>
          Fail transaction refresh
        </Button>
        <Button
          variant="default"
          disabled={pending}
          onClick={() => void refresh(false)}
        >
          Restore transaction reads
        </Button>
      </Group>
    </Stack>
  )
}

function Page({ path }: { path: string }) {
  const queryClient = useQueryClient()
  const [router] = useState(() => {
    const root = createRootRouteWithContext<{
      queryClient: QueryClient
      presentation: typeof fixturePresentation
    }>()({ component: Outlet })
    const authed = createRoute({
      getParentRoute: () => root,
      id: '_authed',
      component: PageFrame,
    })
    // File-route initialization mirrors the generated tree, but uses a local parent.
    // Keep the original instances: their components call Route.useSearch/useLoaderData.
    const mount = (route: AnyRoute, routePath: string) => {
      Object.assign(route.options, {
        id: routePath,
        path: routePath,
        getParentRoute: () => authed,
        beforeLoad: () => waitForRoute(),
      })
      return route
    }
    Object.assign(LandingRoute.options, {
      id: '/',
      path: '/',
      getParentRoute: () => root,
    })
    const home = mount(HomeRoute, '/home')
    const accounts = mount(AccountsRoute, '/accounts')
    const transactions = mount(TransactionsRoute, '/transactions')
    const analysis = mount(AnalysisRoute, '/analysis')
    const settings = mount(SettingsRoute, '/settings')
    return createRouter({
      routeTree: root.addChildren([
        LandingRoute,
        authed.addChildren([home, accounts, transactions, analysis, settings]),
      ]),
      history: createMemoryHistory({ initialEntries: [path] }),
      context: { queryClient, presentation: fixturePresentation },
      defaultPendingComponent: RoutePendingSkeleton,
      defaultPendingMs: 0,
      defaultPendingMinMs: 0,
    })
  })
  useEffect(() => {
    const navigateAnchor = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return
      const anchor = event.target.closest('a')
      if (!anchor) return
      const url = new URL(anchor.href, location.href)
      if (
        url.origin === location.origin &&
        [
          '/',
          '/home',
          '/accounts',
          '/transactions',
          '/analysis',
          '/settings',
        ].includes(url.pathname)
      ) {
        event.preventDefault()
        void router.navigate({ href: url.pathname + url.search })
      }
    }
    document.addEventListener('click', navigateAnchor)
    return () => document.removeEventListener('click', navigateAnchor)
  }, [router])
  return <RouterProvider router={router} />
}
export const pageExamples = [
  {
    id: 'launch-screen',
    title: 'App launch',
    component: ({ state }: ExampleProps) => (
      <LaunchScreen native={state === 'native'} />
    ),
    states: ['checking', 'native'],
    components: ['LaunchScreen'],
  },
  {
    id: 'page-landing',
    title: 'Landing and login',
    component: (_props: ExampleProps) => <Page path="/" />,
    states: ['ready', 'anonymous', 'unavailable'],
    components: ['LandingPage', 'LoginCard'],
  },
  {
    id: 'cached-home',
    title: 'Saved Home preview',
    component: CachedHomeExample,
    states: [
      'cached-validating',
      'masked',
      'missing-series',
      'no-snapshot',
      'empty',
      'offline',
      'refresh-failure',
    ],
    components: ['SavedHomePreview', 'CachedHomeLaunch', 'HomeContent'],
  },
  {
    id: 'page-home',
    title: 'Home page',
    component: (_props: ExampleProps) => <Page path="/home?period=month" />,
    states: [
      'ready',
      'empty',
      'fresh',
      'hourly-refreshing',
      'offline',
      'refresh-failure',
      'retrying',
    ],
    components: [
      'AppShellLayout',
      'HeaderRefreshStatus',
      'NotificationMenu',
      'HomePage',
      'NetWorthCard',
      'LazyChart',
      'RoutePendingSkeleton',
      'AppThemeProvider',
      'AccountSectionSkeleton',
      'AccountSection',
      'AccountGroupHeader',
      'AccountSectionHeading',
      'AccountSectionPanel',
      'HomeChartSkeleton',
      'Chart',
      'CompactAccountRowSkeleton',
      'CompactAccountRow',
      'NetWorthCardFrame',
      'HomeSkeleton',
      'HomePageFrame',
      'CompactAccountRowFrame',
    ],
  },
  {
    id: 'page-accounts',
    title: 'Accounts page',
    component: (_props: ExampleProps) => <Page path="/accounts" />,
    states: ['ready', 'empty', 'long-content'],
    components: [
      'AccountsPage',
      'PageLayout',
      'PageActions',
      'AccountRowSkeleton',
      'AccountRow',
      'AccountRowFrame',
      'AccountsSkeleton',
      'InstitutionAccountsFrame',
      'InstitutionHeadingFrame',
      'AccountsPageFrame',
    ],
  },
  {
    id: 'page-transactions',
    title: 'Transactions page',
    component: (_props: ExampleProps) => <Page path="/transactions" />,
    states: ['ready', 'empty', 'refresh-error'],
    components: [
      'TransactionsPage',
      'PageToolbar',
      'TransactionsTable',
      'TransactionsMobileList',
      'TransactionBulkEditToolbar',
      'ManualTransactionModal',
      'TransactionsSkeleton',
      'TransactionsTableSkeleton',
      'TransactionMobileRowSkeleton',
      'TransactionsMobileListSkeleton',
      'TransactionsPageFrame',
      'TransactionsPageSkeleton',
      'TransactionsToolbarFrame',
      'CategoryTransactionsModal',
      'CategorizationRulesSection',
    ],
  },
  {
    id: 'page-analysis',
    title: 'Analysis page',
    component: (_props: ExampleProps) => <Page path="/analysis" />,
    states: ['ready', 'empty', 'long-content'],
    components: [
      'AnalysisPage',
      'AnalysisSankeyChart',
      'AnalysisAuditHeader',
      'AnalysisAuditDrawer',
      'CategoryTransactionsModal',
      'AnalysisAuditCardFrame',
      'AnalysisAuditSkeleton',
      'AnalysisFlowBody',
      'AnalysisFlowFrame',
      'AnalysisSummaryFrame',
      'CashflowFrame',
      'AnalysisSkeleton',
      'CashflowSkeleton',
      'AnalysisPageFrame',
      'AnalysisDonutSkeleton',
      'AnalysisFlowHeading',
      'TransactionsSkeleton',
      'TransactionsTable',
      'CategorizationRulesSection',
    ],
  },
  {
    id: 'page-settings',
    title: 'Settings page and sections',
    component: (_props: ExampleProps) => {
      const { tab = 'general' } = validateSettingsSearch({
        tab: new URLSearchParams(location.search).get('tab'),
      })
      return <Page path={`/settings?tab=${tab}`} />
    },
    states: [
      'ready',
      'empty',
      'long-content',
      'notification-error',
      'notification-denied',
      'notification-unconfigured',
      'notification-install-required',
      'notification-rebind',
      'notification-registering',
      'notification-enabling',
    ],
    components: [
      'SettingsPage',
      'SettingsRowActions',
      'PageNavigation',
      'AnalysisRulesSection',
      'CategorizationRulesSection',
      'CustomCategoriesSection',
      'PersonalAccessTokenSection',
      'RecurringManualTransactionsSection',
      'GeneralSettingsSkeleton',
      'NotificationSettingsSkeleton',
      'SettingsPageSkeleton',
      'GeneralSettingsFrame',
      'NotificationSettingsFrame',
      'SettingsPageFrame',
      'AnalysisRulesSkeleton',
      'CategorizationRulesSkeleton',
      'RecommendationCardFrame',
      'RecommendationsSkeleton',
      'CategoriesTableSkeleton',
      'AccessTokensSkeleton',
      'PersonalAccessTokenFrame',
      'TokenCardFrame',
      'TokenCardsSkeleton',
      'RecurringTransactionsSkeleton',
      'SettingsCompactRowFrame',
      'SettingsFiltersFrame',
      'SettingsSectionSkeleton',
      'SettingsListPlaceholder',
      'SettingsTableFrame',
      'TransactionsSkeleton',
      'TransactionsTable',
      'CategoryTransactionsModal',
      'SettingsSectionActions',
      'SettingsSectionFilters',
    ],
  },
]
