import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { configureQueryPolicy } from './lib/query-policy'
import { createMutationCache } from './lib/query-invalidation'
import { bindBrowserQueryClient } from './lib/auth-generation'
import { routeTree } from './routeTree.gen'

export interface RouterContext {
  queryClient: QueryClient
}

export function getRouter() {
  const queryClient: QueryClient = new QueryClient({
    mutationCache: createMutationCache(() => queryClient),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Loader failures stay visible through SSR/hydration until an explicit retry.
        retryOnMount: false,
      },
    },
  })

  configureQueryPolicy(queryClient)
  bindBrowserQueryClient(queryClient)

  const router = createRouter({
    routeTree,
    context: {
      queryClient,
    },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 150,
    defaultPendingMinMs: 0,
    defaultPendingComponent: () => <div role="status">Loading page…</div>,
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
