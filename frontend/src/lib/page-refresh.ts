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
  home = () => null,
}: {
  client: QueryClient
  visible: () => boolean
  online: () => boolean
  publish: (status: RefreshStatus) => void
  reconcileDate?: () => boolean
  defer?: () => boolean
  home?: () => { endDate: string } | null
}) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const attempted = new Map<string, number>()
  let foreground: { consumed: Set<string> } | null = null
  let waitingForDate: string | null = null
  const isHomeQuery = (query: Query) => {
    const current = home()
    const params = query.queryKey[1]
    return Boolean(
      current &&
      [
        '/balance-query/dashboard-summary',
        '/balance-query/dashboard-series',
      ].includes(String(query.queryKey[0])) &&
      params &&
      typeof params === 'object' &&
      'endDate' in params &&
      params.endDate === current.endDate,
    )
  }
  const reconcile = () => {
    const previousDate = home()?.endDate
    if (reconcileDate()) {
      waitingForDate = previousDate ?? null
      return false
    }
    if (waitingForDate && home()?.endDate === waitingForDate) return false
    waitingForDate = null
    return true
  }
  const refresh = (q: Query) => {
    attempted.set(q.queryHash, Date.now())
    void client
      .refetchQueries(
        { queryKey: q.queryKey, exact: true, type: 'active' },
        { cancelRefetch: false },
      )
      .catch(() => undefined)
  }
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
      foreground ? 1000 : 60_000,
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
    if (!home()) foreground = null
    status()
    if (!visible() || !online() || defer()) {
      schedule()
      return
    }
    // Let React update date-dependent observers before selecting reads.
    if (!reconcile()) {
      schedule()
      return
    }
    if (foreground) {
      const reads = active().filter(isHomeQuery)
      for (const q of reads) {
        if (foreground.consumed.has(q.queryHash)) continue
        foreground.consumed.add(q.queryHash)
        // Existing launch/date/refresh work satisfies this return. Never restart it.
        if (q.state.fetchStatus === 'idle') refresh(q)
      }
      if (new Set(reads.map((q) => q.queryKey[0])).size === 2) foreground = null
    }
    for (const q of active()) {
      if (
        home() &&
        String(q.queryKey[0]).startsWith('/balance-query/dashboard-') &&
        !isHomeQuery(q)
      )
        continue
      if (q.state.data === undefined || q.state.fetchStatus !== 'idle') continue
      if (!retry && Date.now() < dueAt(q)) continue
      refresh(q)
    }
    schedule()
  }
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (stopped) return
    // New date/period observers may start and even finish before React's wake.
    // Those requests already satisfy a pending return and must not run twice.
    if (
      foreground &&
      event.type === 'updated' &&
      (event.action.type === 'fetch' ||
        (event.action.type === 'success' && !event.action.manual)) &&
      isHomeQuery(event.query)
    )
      foreground.consumed.add(event.query.queryHash)
    status()
    schedule()
  })
  sweep()
  return {
    wake: () => sweep(),
    foreground: () => {
      if (stopped || !home()) return
      // A new actual foreground transition supersedes any deferred prior intent.
      foreground = { consumed: new Set() }
      sweep()
    },
    resumeDeferred: () => {
      if (foreground) sweep()
    },
    reconnect: () => {
      if (stopped) return
      for (const q of active()) {
        if (q.state.status === 'error') attempted.delete(q.queryHash)
      }
      // Explicit recovery retries failed reads, while fresh reads stay untouched.
      if (visible() && online() && !defer() && reconcile()) {
        for (const q of active()) {
          if (foreground && isHomeQuery(q)) continue
          if (
            home() &&
            String(q.queryKey[0]).startsWith('/balance-query/dashboard-') &&
            !isHomeQuery(q)
          )
            continue
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
      foreground = null
      clearTimeout(timer)
      unsubscribe()
    },
  }
}
