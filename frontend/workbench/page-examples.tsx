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
import { AppShellLayout } from '../src/components/AppShellLayout'
import { Route as LandingRoute } from '../src/routes/index'
import { Route as HomeRoute } from '../src/routes/_authed/home'
import { Route as AccountsRoute } from '../src/routes/_authed/accounts'
import { Route as TransactionsRoute } from '../src/routes/_authed/transactions'
import { Route as AnalysisRoute } from '../src/routes/_authed/analysis'
import { Route as SettingsRoute } from '../src/routes/_authed/settings'
import { RoutePendingSkeleton } from '../src/components/loading/RoutePendingSkeleton'
import { LaunchScreen } from '../src/components/loading/LaunchScreen'
import { validateSettingsSearch } from '../src/lib/route-search'
import { invalidateFamilies } from '../src/lib/query-invalidation'
import { simulateLogout } from './auth-boundary'
import { fixturePresentation } from './runtime-boundaries'
import { setTransactionRefreshFailure } from './fixture-api'
import type { AnyRoute } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { ExampleProps } from './examples'

function PageFrame() {
  const location = useLocation()
  const router = useRouter()
  const showRefreshScenario =
    location.pathname === '/transactions' &&
    new URLSearchParams(window.location.search).get('state') === 'refresh-error'
  return (
    <AppShellLayout
      pathname={location.pathname}
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
    id: 'page-home',
    title: 'Home page',
    component: (_props: ExampleProps) => <Page path="/home?period=month" />,
    states: ['ready', 'empty'],
    components: [
      'AppShellLayout',
      'NotificationMenu',
      'HomePage',
      'NetWorthCard',
      'LazyChart',
      'RoutePendingSkeleton',
      'AppThemeProvider',
    ],
  },
  {
    id: 'page-accounts',
    title: 'Accounts page',
    component: (_props: ExampleProps) => <Page path="/accounts" />,
    states: ['ready', 'empty', 'long-content'],
    components: ['AccountsPage', 'PageLayout', 'PageActions'],
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
    ],
  },
]
