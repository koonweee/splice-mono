import type { FetchQueryOptions, QueryClient } from '@tanstack/react-query'

// SSR waits for essential data so refreshes still return populated HTML. Client
// navigation renders the destination immediately; its queries own loading/error
// states and deduplicate the request already started by the loader.
export function awaitSsrData<T>(request: Promise<T>) {
  const settled = request.catch(() => undefined)
  return typeof window === 'undefined' ? settled : undefined
}

// Cached content, including stale content, remains available while Query owns
// the deduplicated background refresh.
export function loadQuery<T, TError>(
  client: QueryClient,
  options: FetchQueryOptions<T, TError>,
) {
  return awaitSsrData(
    client.ensureQueryData({ ...options, revalidateIfStale: true }),
  )
}
