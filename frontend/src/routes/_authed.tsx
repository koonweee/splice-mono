import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  NavLink,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  useRouter,
} from '@tanstack/react-router'
import {
  CreditCard,
  Home,
  LogOut,
  PieChart,
  Settings,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createNavigationPreparation } from '../lib/navigation-preload'
import { preparePageFeatureCode } from '../lib/feature-loaders'
import { usePresentationPreferences } from '../lib/presentation-preferences'
import { PrivateSessionBoundary } from '../components/PrivateSessionBoundary'
import { useLogout } from '../lib/auth'
import { isConfirmedLoggedOutError } from '../lib/session-refresh'
import { sessionQueryOptions, useSession } from '../lib/session'
import { applyThemePresetId, normalizeThemePresetId } from '../lib/theme'
import styles from './_authed.module.css'
import type { PrimaryDestination } from '../lib/navigation-preload'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location, context }) => {
    if (context.sessionOutcome === 'anonymous')
      throw redirect({
        to: '/',
        search: { login: true, redirect: location.href },
      })
    if (context.sessionOutcome === 'unavailable')
      throw new Error('Session is temporarily unavailable. Please retry.')
    await requireAuthedSession({
      location,
      queryClient: context.queryClient,
    })
  },
  component: AuthedLayout,
})

export async function requireAuthedSession({
  location,
  queryClient,
}: {
  location: { pathname: string; href?: string }
  queryClient: {
    ensureQueryData: (
      options: ReturnType<typeof sessionQueryOptions>,
    ) => Promise<unknown>
  }
}) {
  try {
    await queryClient.ensureQueryData(sessionQueryOptions())
  } catch (error) {
    if (!isConfirmedLoggedOutError(error)) {
      throw error
    }

    throw redirect({
      to: '/',
      search: {
        login: true,
        redirect: location.href ?? location.pathname,
      },
    })
  }
}

function AuthedLayout() {
  return (
    <PrivateSessionBoundary>
      <AuthenticatedLayoutContent />
    </PrivateSessionBoundary>
  )
}

function AuthenticatedLayoutContent() {
  const [opened, { toggle }] = useDisclosure()
  const location = useLocation()
  const logoutMutation = useLogout()
  const { data: session } = useSession()
  const user = session?.user
  const router = useRouter()
  const queryClient = useQueryClient()
  const { today } = usePresentationPreferences()
  const preparation = useRef<ReturnType<
    typeof createNavigationPreparation
  > | null>(null)
  useEffect(() => {
    if (!user) return
    const coordinator = createNavigationPreparation({
      client: queryClient,
      identity: user.id,
      currency: user.settings.currency,
      today,
      foregroundCode: preparePageFeatureCode(
        router.state.location.pathname,
        router.state.location.search,
      ),
      foregroundBusy: () =>
        router.state.status === 'pending' ||
        queryClient.isFetching({
          predicate: (query) =>
            query.getObserversCount() > 0 && query.state.data === undefined,
        }) > 0,
      loadRouteCode: (destination) =>
        router.loadRouteChunk(router.routesById[`/_authed${destination}`]),
    })
    preparation.current = coordinator
    const unsubscribe = router.subscribe('onResolved', coordinator.wake)
    const unsubscribeNavigation = router.subscribe(
      'onBeforeNavigate',
      ({ toLocation }) => {
        coordinator.prioritizeCode(
          preparePageFeatureCode(toLocation.pathname, toLocation.search),
        )
      },
    )
    return () => {
      unsubscribe()
      unsubscribeNavigation()
      coordinator.stop()
      preparation.current = null
    }
  }, [router, queryClient, user?.id, user?.settings.currency, today])
  const prepareDestination = (to: PrimaryDestination) =>
    preparation.current?.prepare(to)

  useEffect(() => {
    if (user?.settings) {
      applyThemePresetId(normalizeThemePresetId(user.settings.theme))
    }
  }, [user?.settings])

  const navItems = [
    { to: '/home', label: 'Home', icon: Home },
    { to: '/transactions', label: 'Transactions', icon: TrendingUp },
    { to: '/analysis', label: 'Analysis', icon: PieChart },
    { to: '/accounts', label: 'Accounts', icon: CreditCard },
    { to: '/settings', label: 'Settings', icon: Settings },
  ] as const

  const handleLogout = () => {
    logoutMutation.mutate({ data: {} })
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !opened, desktop: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              aria-label={opened ? 'Close navigation' : 'Open navigation'}
              aria-expanded={opened}
              aria-controls="main-navigation"
              opened={opened}
              onClick={toggle}
              size="sm"
            />
            <Text fw={700} size="lg">
              Splice
            </Text>
          </Group>
          <Tooltip label="Logout">
            <ActionIcon
              aria-label="Log out"
              variant="subtle"
              color="gray"
              onClick={handleLogout}
              loading={logoutMutation.isPending}
            >
              <LogOut size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" id="main-navigation">
        <Stack gap="xs">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={18} />}
              active={location.pathname === item.to}
              onPointerEnter={() => prepareDestination(item.to)}
              onFocus={() => prepareDestination(item.to)}
              onTouchStart={() => prepareDestination(item.to)}
              onClick={() => {
                prepareDestination(item.to)
                toggle()
              }}
            />
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main className={styles.main}>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
