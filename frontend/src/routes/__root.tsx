import {
  ColorSchemeScript,
  mantineHtmlProps,
  MantineProvider,
} from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'

import type { RouterContext } from '../router'

import { themes } from '@/lib/theme'
import mantineChartsCss from '@mantine/charts/styles.css?url'
import mantineCss from '@mantine/core/styles.css?url'
import mantineNotificationsCss from '@mantine/notifications/styles.css?url'
import appCss from '../styles.css?url'

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
        rel: 'stylesheet',
        href: mantineCss,
      },
      {
        rel: 'stylesheet',
        href: mantineChartsCss,
      },
      {
        rel: 'stylesheet',
        href: mantineNotificationsCss,
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
        <ColorSchemeScript defaultColorScheme="auto" />
        <HeadContent />
      </head>
      <body>
        <MantineProvider defaultColorScheme="auto" theme={themes.warm}>
          <Notifications />
          <Outlet />
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  )
}
