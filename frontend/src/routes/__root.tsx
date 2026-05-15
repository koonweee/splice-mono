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
          <PwaLifecycle />
          <Outlet />
        </AppThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
