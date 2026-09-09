import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  useRouter,
} from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePageRefresh } from '../lib/use-page-refresh'
import { createNavigationPreparation } from '../lib/navigation-preload'
import { preparePageFeatureCode } from '../lib/feature-loaders'
import { usePresentationPreferences } from '../lib/presentation-preferences'
import { PrivateSessionBoundary } from '../components/PrivateSessionBoundary'
import { useLogout } from '../lib/auth'
import { isConfirmedLoggedOutError } from '../lib/session-refresh'
import { sessionQueryOptions, useSession } from '../lib/session'
import { APPEARANCE_STORAGE_KEY } from '../lib/appearance-preferences'
import { NotificationMenu } from '../components/notifications/NotificationMenu'
import { AppShellLayout } from '../components/AppShellLayout'
import {
  ownsHomePresentation,
  useHomePublication,
} from '../lib/pwa/home-continuity'
import type { HomeShell } from '../lib/pwa/home-continuity'
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
  const location = useLocation()
  const logoutMutation = useLogout()
  const { data: session } = useSession()
  const user = session?.user
  const refresh = usePageRefresh(
    user?.id,
    user?.settings.timezone,
    location.pathname,
  )
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
    const syncSavedAppearance = (event: StorageEvent) => {
      if (event.key === APPEARANCE_STORAGE_KEY)
        void queryClient.invalidateQueries({ queryKey: ['/user/me'] })
    }
    window.addEventListener('storage', syncSavedAppearance)
    return () => window.removeEventListener('storage', syncSavedAppearance)
  }, [queryClient])

  const hosted = ownsHomePresentation()
  const shell: HomeShell = {
    pathname: location.pathname,
    refreshStatus: refresh.status,
    onRetryRefresh: refresh.retry,
    headerActions: (
      <NotificationMenu
        onNavigate={(url) => {
          void router.navigate({ href: url })
        }}
      />
    ),
    onLogout: () => logoutMutation.mutate({ data: {} }),
    logoutPending: logoutMutation.isPending,
    onPrepareDestination: prepareDestination,
  }
  useHomePublication('shell', shell, hosted)
  return hosted ? (
    <Outlet />
  ) : (
    <AppShellLayout {...shell}>
      <Outlet />
    </AppShellLayout>
  )
}
