import {
  ColorSchemeScript,
  mantineHtmlProps,
} from '@mantine/core'
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
import {
  DEFAULT_THEME_PRESET_ID,
  THEME_PRESET_IDS,
  THEME_STORAGE_KEY,
} from '../lib/theme'
import type { RouterContext } from '../router'
import { AppThemeProvider } from '@/components/AppThemeProvider'

export const Route = createRootRouteWithContext<RouterContext>()({
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
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
try {
  var theme = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  var knownThemes = ${JSON.stringify(THEME_PRESET_IDS)};
  if (knownThemes.indexOf(theme) !== -1 && theme !== ${JSON.stringify(DEFAULT_THEME_PRESET_ID)}) {
    document.documentElement.setAttribute('data-splice-theme-loading', '');
  }
} catch (_) {}
`,
          }}
        />
        <ColorSchemeScript defaultColorScheme="auto" />
        <HeadContent />
      </head>
      <body>
        <AppThemeProvider>
          <Notifications />
          <Outlet />
        </AppThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
