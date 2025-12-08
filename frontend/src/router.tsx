import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { tokenStorage } from './lib/auth'
import { routeTree } from './routeTree.gen'

export interface RouterContext {
  queryClient: QueryClient
  auth: {
    isAuthenticated: () => boolean
  }
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
      },
    },
  })

  const router = createRouter({
    routeTree,
    context: {
      queryClient,
      auth: {
        isAuthenticated: () => tokenStorage.hasTokens(),
      },
    },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
