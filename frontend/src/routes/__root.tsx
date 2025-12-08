import { ColorSchemeScript, MantineProvider } from '@mantine/core'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
} from '@tanstack/react-router'

import type { RouterContext } from '../router'

import mantineCss from '@mantine/core/styles.css?url'
import appCss from '../styles.css?url'

const PUBLIC_PATHS = ['/', '/login']

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: ({ location, context }) => {
    if (PUBLIC_PATHS.includes(location.pathname)) {
      return
    }

    // Skip auth check during SSR - cookies will authenticate API requests
    // The client will handle redirects after hydration if needed
    if (typeof window === 'undefined') {
      return
    }

    if (!context.auth.isAuthenticated()) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },

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
        href: appCss,
      },
    ],
  }),

  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
        <HeadContent />
      </head>
      <body>
        <MantineProvider defaultColorScheme="light">
          <Outlet />
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  )
}
