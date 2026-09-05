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
import { getThemePreset } from '../lib/theme'
import {
  PresentationProvider,
  getPresentationPreferences,
} from '../lib/presentation-preferences'
import { SessionOutcomeContext, sessionQueryOptions } from '../lib/session'
import { isConfirmedLoggedOutError } from '../lib/session-refresh'
import { PrivateSessionBoundary } from '../components/PrivateSessionBoundary'
import type { PresentationPreferences } from '../lib/presentation-preferences'
import type { User } from '../api/models/user'
import type { SessionOutcome } from '../lib/session'
import type { RouterContext } from '../router'
import { AppThemeProvider } from '@/components/AppThemeProvider'
import { PwaLifecycle } from '@/components/PwaLifecycle'

const APPLE_STARTUP_IMAGE_LINKS = [
  {
    href: '/splash/apple-splash-1290-2796.png',
    media:
      '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/splash/apple-splash-1170-2532.png',
    media:
      '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/splash/apple-splash-1284-2778.png',
    media:
      '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/splash/apple-splash-1242-2688.png',
    media:
      '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/splash/apple-splash-828-1792.png',
    media:
      '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  },
  {
    href: '/splash/apple-splash-1125-2436.png',
    media:
      '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/splash/apple-splash-1242-2208.png',
    media:
      '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/splash/apple-splash-750-1334.png',
    media:
      '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  },
].map(({ href, media }) => ({
  rel: 'apple-touch-startup-image',
  href,
  media,
}))

export const Route = createRootRouteWithContext<RouterContext>()({
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
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Splice',
      },
      {
        name: 'theme-color',
        content: '#282a36',
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
        href: appCss,
      },
    ],
  }),

  component: RootComponent,
})

function RootComponent() {
  const { presentation, sessionOutcome, authenticated } = Route.useLoaderData()
  const preset = getThemePreset(presentation.theme)
  return (
    <html
      lang="en"
      {...mantineHtmlProps}
      data-mantine-color-scheme={preset.colorScheme}
    >
      <head>
        <ColorSchemeScript forceColorScheme={preset.colorScheme} />
        <HeadContent />
      </head>
      <body>
        <AppThemeProvider
          initialTheme={presentation.theme}
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
        <Scripts />
      </body>
    </html>
  )
}
