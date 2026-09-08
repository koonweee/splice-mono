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
import appCss from '../styles.css?url'
import { resolveAppearance } from '../lib/design-system/appearance'
import { BASES } from '../lib/design-system/bases'
import {
  PresentationProvider,
  getPresentationPreferences,
} from '../lib/presentation-preferences'
import { SessionOutcomeContext, sessionQueryOptions } from '../lib/session'
import { isConfirmedLoggedOutError } from '../lib/session-refresh'
import { PrivateSessionBoundary } from '../components/PrivateSessionBoundary'
import { LaunchScreen } from '../components/loading/LaunchScreen'
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

export const Route = createRootRouteWithContext<RouterContext>()({
  // Send public launch markup immediately. Auth still resolves before any
  // private child mounts; direct private URLs retain authenticated SSR.
  ssr: ({ location }) => location.pathname !== '/',
  shellComponent: DocumentShell,
  pendingComponent: LaunchScreen,
  beforeLoad: async ({
    context,
  }): Promise<{
    sessionUser: Omit<User, 'providerDetails'> | null
    sessionOutcome: SessionOutcome
    presentation: PresentationPreferences
  }> => {
    let sessionOutcome: SessionOutcome = 'authenticated'
    const sessionUser = await context.queryClient
      .ensureQueryData(sessionQueryOptions())
      .catch((error: unknown) => {
        sessionOutcome = isConfirmedLoggedOutError(error)
          ? 'anonymous'
          : 'unavailable'
        return null
      })
    const presentation = await getPresentationPreferences(sessionUser)
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
    return { sessionUser: safeUser, sessionOutcome, presentation }
  },
  loader: ({ context }) => ({
    presentation: context.presentation,
    sessionOutcome: context.sessionOutcome,
    authenticated: Boolean(context.sessionUser),
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
  const preset = resolveAppearance(
    // The shell also renders before loaders run on the client-only launch path.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    data?.presentation.appearance ?? {
      mode: 'oled',
      accent: null,
      monospaceAmounts: false,
    },
  )
  return (
    <html
      lang="en"
      {...mantineHtmlProps}
      data-mantine-color-scheme={preset.colorScheme}
    >
      <head>
        <ColorSchemeScript forceColorScheme={preset.colorScheme} />
        <HeadContent />
        {developmentStyles && <style>{developmentStyles}</style>}
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  const { presentation, sessionOutcome, authenticated } = Route.useLoaderData()
  return (
    <AppThemeProvider
      initialAppearance={presentation.appearance}
      authenticated={authenticated}
    >
      <SessionOutcomeContext.Provider value={sessionOutcome}>
        <PresentationProvider initial={presentation}>
          <PrivateSessionBoundary fallback={null}>
            <Notifications />
          </PrivateSessionBoundary>
          <PwaLifecycle />
          <Outlet />
        </PresentationProvider>
      </SessionOutcomeContext.Provider>
    </AppThemeProvider>
  )
}
