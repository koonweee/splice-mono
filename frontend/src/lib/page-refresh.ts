import type { Query, QueryClient } from '@tanstack/react-query'

export type RefreshStatus = {
  phase: 'idle' | 'refreshing' | 'offline' | 'error'
  lastSuccessfulAt: number | null
}
export const PAGE_REFRESH_INTERVAL = 60 * 60_000
const RETRY_DELAY = 5 * 60_000

/** Explicit page reads. Auth, notifications, credentials and provider sync are separate. */
export const PAGE_READ_KEYS = [
  '/account',
  '/balance-query/dashboard-summary',
  '/balance-query/dashboard-series',
  '/balance-query/balances',
  '/balance-query/all-balances',
  '/transaction',
  '/transaction-analysis',
  '/transaction-analysis/audit',
  '/transaction-analysis/transactions',
  '/category',
  '/category/filter-options',
  '/category/manage',
  '/category/custom',
  '/analysis-rules',
  '/categorization-rules',
  '/recurring-manual-transaction',
] as const
export const pageReadPolicy = {
  meta: { periodicPageRead: true },
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const

export function createPageRefreshCoordinator({
  client,
  visible,
  online,
  publish,
  reconcileDate = () => false,
  defer = () => false,
}: {
  client: QueryClient
  visible: () => boolean
  online: () => boolean
  publish: (status: RefreshStatus) => void
  reconcileDate?: () => boolean
  defer?: () => boolean
}) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const attempted = new Map<string, number>()
  const active = () =>
    client.getQueryCache().findAll({
      predicate: (q) => q.meta?.periodicPageRead === true && q.isActive(),
    })
  const status = () => {
    const reads = active().filter((q) => q.state.data !== undefined)
    const timestamps = reads.map((q) => q.state.dataUpdatedAt).filter(Boolean)
    publish({
      phase: !online()
        ? 'offline'
        : reads.some((q) => q.state.fetchStatus === 'fetching')
          ? 'refreshing'
          : reads.some((q) => q.state.status === 'error')
            ? 'error'
            : 'idle',
      // Oldest visible result: partial success never claims all data is current.
      lastSuccessfulAt: timestamps.length ? Math.min(...timestamps) : null,
    })
  }
  const dueAt = (q: Query) =>
    Math.max(
      q.state.dataUpdatedAt + PAGE_REFRESH_INTERVAL,
      (attempted.get(q.queryHash) ?? 0) + RETRY_DELAY,
      q.state.errorUpdatedAt ? q.state.errorUpdatedAt + RETRY_DELAY : 0,
    )
  const schedule = () => {
    clearTimeout(timer)
    if (stopped || !visible() || !online()) return
    const next = Math.min(
      60_000,
      ...active()
        .filter(
          (q) => q.state.data !== undefined && q.state.fetchStatus === 'idle',
        )
        .map((q) => Math.max(1000, dueAt(q) - Date.now())),
    )
    timer = setTimeout(() => sweep(), next)
  }
  const sweep = (retry = false) => {
    if (stopped) return
    status()
    if (!visible() || !online() || defer()) {
      schedule()
      return
    }
    // Let React update date-dependent observers before selecting reads.
    if (reconcileDate()) {
      schedule()
      return
    }
    for (const q of active()) {
      if (q.state.data === undefined || q.state.fetchStatus !== 'idle') continue
      if (!retry && Date.now() < dueAt(q)) continue
      attempted.set(q.queryHash, Date.now())
      void client
        .refetchQueries(
          { queryKey: q.queryKey, exact: true, type: 'active' },
          { cancelRefetch: false },
        )
        .catch(() => undefined)
    }
    schedule()
  }
  const unsubscribe = client.getQueryCache().subscribe(() => {
    if (stopped) return
    status()
    schedule()
  })
  sweep()
  return {
    wake: () => sweep(),
    reconnect: () => {
      for (const q of active()) {
        if (q.state.status === 'error') attempted.delete(q.queryHash)
      }
      // Explicit recovery retries failed reads, while fresh reads stay untouched.
      if (visible() && online() && !defer() && !reconcileDate()) {
        for (const q of active()) {
          if (q.state.status === 'error' && q.state.fetchStatus === 'idle') {
            attempted.set(q.queryHash, Date.now())
            void client
              .refetchQueries(
                { queryKey: q.queryKey, exact: true, type: 'active' },
                { cancelRefetch: false },
              )
              .catch(() => undefined)
          }
        }
      }
      sweep()
    },
    retry: () => sweep(true),
    stop: () => {
      stopped = true
      clearTimeout(timer)
      unsubscribe()
    },
  }
}
