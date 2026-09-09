import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

import mantineChartsCss from '@mantine/charts/styles.css?url'
import mantineCss from '@mantine/core/styles.css?url'
import mantineDatesCss from '@mantine/dates/styles.css?url'
import mantineNotificationsCss from '@mantine/notifications/styles.css?url'
import mantineReactTableCss from 'mantine-react-table/styles.css?url'
import { useSyncExternalStore } from 'react'
import appCss from '../styles.css?url'
import {
  DEFAULT_APPEARANCE,
  resolveAppearance,
} from '../lib/design-system/appearance'
import { BASES } from '../lib/design-system/bases'
import {
  PresentationProvider,
  getPresentationPreferences,
  readPresentationCookies,
} from '../lib/presentation-preferences'
import { SessionOutcomeContext, sessionQueryOptions } from '../lib/session'
import { isConfirmedLoggedOutError } from '../lib/session-refresh'
import { PrivateSessionBoundary } from '../components/PrivateSessionBoundary'
import { CachedHomeLaunch } from '../components/pages/CachedHomeLaunch'
import {
  cachedHomeEnabled,
  isHomeLaunchUrl,
  isLocalLaunch,
} from '../lib/pwa/launch-mode'
import { clearHomeSnapshot } from '../lib/pwa/home-snapshot'
import {
  dashboardSeriesOptions,
  dashboardSummaryOptions,
} from '../lib/queries/dashboard'
import {
  getHomeLaunch,
  getServerHomeLaunch,
  prepareHomeLaunch,
  subscribeHomeLaunch,
} from '../lib/pwa/home-launch'
import { HomeContinuityHost } from '../components/pages/HomeContinuityHost'
import { readLaunchAppearance } from '../lib/pwa/launch-canvas'
import { TimePeriod } from '../lib/types'
import { isValidTimePeriod } from '../lib/route-search'
import { appleStartupImages } from '../lib/pwa/startup-images'
import type { ReactNode } from 'react'
import type { PresentationPreferences } from '../lib/presentation-preferences'
import type { User } from '../api/models/user'
import type { SessionOutcome } from '../lib/session'
import type { RouterContext } from '../router'
import { AppThemeProvider } from '@/components/AppThemeProvider'
import { PwaLifecycle } from '@/components/PwaLifecycle'

// Vite injects CSS modules through JavaScript in development. Include their
// processed CSS in the server-rendered head to avoid an unstyled first paint.
// Production uses the persistent stylesheet emitted by the Vite build plugin.
const developmentStyles = import.meta.env.DEV
  ? Object.values(
      import.meta.glob<string>('../**/*.module.css', {
        eager: true,
        query: '?inline',
        import: 'default',
      }),
    ).join('\n')
  : undefined

const APPLE_STARTUP_IMAGE_LINKS = appleStartupImages.map(({ href, media }) => ({
  rel: 'apple-touch-startup-image',
  href,
  media,
}))

let localHomePrepared = false

export const Route = createRootRouteWithContext<RouterContext>()({
  // Send public launch markup immediately. Auth still resolves before any
  // private child mounts; direct private URLs retain authenticated SSR.
  ssr: ({ location }) => location.pathname !== '/',
  shellComponent: DocumentShell,
  pendingComponent: CachedHomeLaunch,
  pendingMs: isLocalLaunch ? 0 : undefined,
  wrapInSuspense: isLocalLaunch || undefined,
  beforeLoad: async ({
    context,
  }): Promise<{
    sessionUser: Omit<User, 'providerDetails'> | null
    sessionOutcome: SessionOutcome
    presentation: PresentationPreferences
    savedHomeAvailable: boolean
  }> => {
    const snapshotPromise =
      typeof window !== 'undefined' &&
      !localHomePrepared &&
      cachedHomeEnabled &&
      isHomeLaunchUrl(new URL(window.location.href))
        ? prepareHomeLaunch()
        : Promise.resolve(null)
    if (typeof window !== 'undefined' && !cachedHomeEnabled) clearHomeSnapshot()
    let sessionOutcome: SessionOutcome = 'authenticated'
    let sessionUser: User | null = null
    try {
      sessionUser = await context.queryClient.ensureQueryData(
        sessionQueryOptions(),
      )
    } catch (error) {
      sessionOutcome = isConfirmedLoggedOutError(error)
        ? 'anonymous'
        : 'unavailable'
    }
    let presentation = await getPresentationPreferences(sessionUser)
    let keepSavedHome = false
    const snapshot = await snapshotPromise
    if (sessionOutcome === 'anonymous') clearHomeSnapshot()
    if (snapshot && sessionUser && snapshot.identity !== sessionUser.id)
      clearHomeSnapshot(snapshot.authEpoch)
    if (
      snapshot &&
      sessionUser?.id === snapshot.identity &&
      snapshot.presentation.currency === sessionUser.settings.currency
    ) {
      const seed = <T,>(
        key: ReadonlyArray<unknown>,
        data: T,
        updatedAt: number,
      ) => {
        if (
          (context.queryClient.getQueryState(key)?.dataUpdatedAt ?? 0) <
          updatedAt
        )
          context.queryClient.setQueryData(key, data, { updatedAt })
      }
      seed(
        dashboardSummaryOptions(snapshot.period, snapshot.endDate).queryKey,
        snapshot.summary.data,
        snapshot.summary.updatedAt,
      )
      if (snapshot.series)
        seed(
          dashboardSeriesOptions(snapshot.period, snapshot.endDate).queryKey,
          snapshot.series.data,
          snapshot.series.updatedAt,
        )
    }
    if (
      isLocalLaunch &&
      !localHomePrepared &&
      sessionUser &&
      isHomeLaunchUrl(new URL(window.location.href))
    ) {
      const requested = new URL(window.location.href).searchParams.get('period')
      const period = isValidTimePeriod(requested) ? requested : TimePeriod.month
      // Keep the launch preview until the first live summary is prepared. Force
      // a real read on launch even when the restored data was recently written.
      const liveSummary = await context.queryClient
        .fetchQuery({
          ...dashboardSummaryOptions(period, presentation.today),
          staleTime: 0,
        })
        .then(
          () => true,
          () => false,
        )
      keepSavedHome =
        !liveSummary &&
        Boolean(
          snapshot &&
          snapshot.identity === sessionUser.id &&
          !context.queryClient.getQueryData(
            dashboardSummaryOptions(period, presentation.today).queryKey,
          ),
        )
      void context.queryClient.prefetchQuery({
        ...dashboardSeriesOptions(period, presentation.today),
        staleTime: 0,
      })
      // Local masking remains usable while launch reads are in flight.
      presentation = await getPresentationPreferences(sessionUser)
      localHomePrepared = !keepSavedHome
    }
    if (
      typeof window !== 'undefined' &&
      !isLocalLaunch &&
      sessionOutcome !== 'unavailable'
    )
      localHomePrepared = true
    const safeUser = sessionUser
      ? {
          id: sessionUser.id,
          email: sessionUser.email,
          displayName: sessionUser.displayName,
          avatarUrl: sessionUser.avatarUrl,
          settings: sessionUser.settings,
          createdAt: sessionUser.createdAt,
          updatedAt: sessionUser.updatedAt,
        }
      : null
    return {
      sessionUser: safeUser,
      sessionOutcome,
      presentation,
      savedHomeAvailable:
        keepSavedHome || Boolean(snapshot && sessionOutcome === 'unavailable'),
    }
  },
  loader: ({ context }) => ({
    presentation: context.presentation,
    sessionOutcome: context.sessionOutcome,
    authenticated: Boolean(context.sessionUser),
    savedHomeAvailable: context.savedHomeAvailable,
  }),
  head: ({ loaderData }) => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      {
        title: 'Splice',
      },
      {
        name: 'theme-color',
        content: loaderData
          ? resolveAppearance(loaderData.presentation.appearance).colors.canvas
          : BASES.oled.canvas,
      },
      {
        name: 'apple-mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-title',
        content: 'Splice',
      },
      {
        name: 'apple-mobile-web-app-status-bar-style',
        content: 'black-translucent',
      },
      {
        name: 'format-detection',
        content: 'telephone=no',
      },
    ],
    links: [
      {
        rel: 'icon',
        href: '/favicon.ico',
        sizes: '16x16 24x24 32x32 64x64',
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
        sizes: '180x180',
      },
      {
        rel: 'manifest',
        href: '/manifest.json',
      },
      ...APPLE_STARTUP_IMAGE_LINKS,
      {
        rel: 'stylesheet',
        href: mantineCss,
      },
      {
        rel: 'stylesheet',
        href: mantineChartsCss,
      },
      {
        rel: 'stylesheet',
        href: mantineDatesCss,
      },
      {
        rel: 'stylesheet',
        href: mantineNotificationsCss,
      },
      {
        rel: 'stylesheet',
        href: mantineReactTableCss,
      },
      {
        rel: 'stylesheet',
        // Vite's ?url export can gain a client-only HMR timestamp.
        // The dev server revalidates this stable CSS URL on refresh.
        href: import.meta.env.DEV ? '/src/styles.css' : appCss,
      },
    ],
  }),

  component: RootComponent,
})

function DocumentShell({ children }: { children: ReactNode }) {
  const data = Route.useLoaderData()
  const launch = useSyncExternalStore(
    subscribeHomeLaunch,
    getHomeLaunch,
    getServerHomeLaunch,
  )
  const initialPresentation = data?.presentation ?? {
    appearance:
      readLaunchAppearance() ??
      launch.snapshot?.presentation.appearance ??
      (isLocalLaunch
        ? DEFAULT_APPEARANCE
        : { mode: 'oled' as const, accent: null }),
    today:
      launch.snapshot?.endDate ??
      (typeof document !== 'undefined'
        ? readPresentationCookies(document.cookie).today
        : ''),
    maskBalances:
      typeof document !== 'undefined'
        ? (readPresentationCookies(document.cookie).maskBalances ??
          launch.snapshot?.presentation.maskBalances ??
          true)
        : true,
  }
  const preset = resolveAppearance(
    // The shell also renders before loaders run on the client-only launch path.

    initialPresentation.appearance,
  )
  return (
    <html
      lang="en"
      {...mantineHtmlProps}
      data-mantine-color-scheme={preset.colorScheme}
      style={
        {
          background: 'var(--mantine-color-body, var(--splice-launch-canvas))',
          '--splice-launch-canvas': preset.colors.canvas,
        } as React.CSSProperties
      }
    >
      <head>
        <ColorSchemeScript forceColorScheme={preset.colorScheme} />
        <HeadContent />
        {developmentStyles && <style>{developmentStyles}</style>}
      </head>
      <body
        style={{
          background: 'var(--mantine-color-body, var(--splice-launch-canvas))',
        }}
      >
        <AppThemeProvider
          initialAppearance={initialPresentation.appearance}
          restoreStoredAppearance={!isLocalLaunch}
          authenticated={Boolean(data?.authenticated)}
        >
          <PresentationProvider initial={initialPresentation}>
            {isLocalLaunch && <HomeContinuityHost />}
            {children}
          </PresentationProvider>
        </AppThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  const { sessionOutcome, authenticated, savedHomeAvailable } =
    Route.useLoaderData()
  if (savedHomeAvailable) return <CachedHomeLaunch failed />
  return (
    <SessionOutcomeContext.Provider value={sessionOutcome}>
      <PrivateSessionBoundary fallback={null}>
        <Notifications />
      </PrivateSessionBoundary>
      <PwaLifecycle offlineStatusOwnedByHeader={authenticated} />
      <Outlet />
    </SessionOutcomeContext.Provider>
  )
}
