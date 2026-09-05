import type { FetchQueryOptions, QueryClient } from '@tanstack/react-query'

// Cached content is returned immediately, including stale content. Query owns the
// deduplicated background refresh. Cold requests wait only for essential data.
export function loadQuery<T, TError>(
  client: QueryClient,
  options: FetchQueryOptions<T, TError>,
) {
  return client
    .ensureQueryData({ ...options, revalidateIfStale: true })
    .catch(() => undefined)
}
