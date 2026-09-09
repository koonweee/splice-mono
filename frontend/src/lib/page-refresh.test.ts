import {
  InfiniteQueryObserver,
  QueryClient,
  QueryObserver,
} from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PAGE_REFRESH_INTERVAL,
  createPageRefreshCoordinator,
  pageReadPolicy,
} from './page-refresh'
import { configureQueryPolicy } from './query-policy'

let client: QueryClient
let cleanup: Array<() => void>
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-10T12:00:00Z'))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  cleanup = []
})
afterEach(() => {
  cleanup.forEach((stop) => stop())
  client.clear()
  vi.useRealTimers()
})
function observe(key = '/account', updatedAt = Date.now(), managed = true) {
  const fn = vi.fn().mockResolvedValue(['new'])
  const observer = new QueryObserver(client, {
    queryKey: [key],
    queryFn: fn,
    initialData: ['saved'],
    initialDataUpdatedAt: updatedAt,
    staleTime: Infinity,
    ...(managed ? pageReadPolicy : {}),
  })
  const unsubscribe = observer.subscribe(() => {})
  cleanup.push(unsubscribe)
  return { fn, observer, unsubscribe }
}
function start(
  options: Partial<Parameters<typeof createPageRefreshCoordinator>[0]> = {},
) {
  const publish = vi.fn()
  const c = createPageRefreshCoordinator({
    client,
    visible: () => true,
    online: () => true,
    publish,
    ...options,
  })
  cleanup.push(c.stop)
  return { ...c, publish }
}
describe('visible page refresh', () => {
  it('uses successful timestamps and ignores early focus bursts', async () => {
    const { fn } = observe('/account', Date.now() - 30 * 60_000)
    const c = start()
    c.wake()
    c.wake()
    await vi.advanceTimersByTimeAsync(29 * 60_000)
    expect(fn).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fn).toHaveBeenCalledTimes(1)
    c.wake()
    c.reconnect()
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('pauses hidden/offline and catches up once on return', async () => {
    let visible = false
    let online = false
    const { fn } = observe('/account', Date.now() - PAGE_REFRESH_INTERVAL)
    const c = start({ visible: () => visible, online: () => online })
    await vi.advanceTimersByTimeAsync(PAGE_REFRESH_INTERVAL)
    expect(fn).not.toHaveBeenCalled()
    visible = true
    online = true
    c.wake()
    c.reconnect()
    c.wake()
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('backs off failures, retains data and retries on reconnect', async () => {
    const { fn } = observe('/account', Date.now() - PAGE_REFRESH_INTERVAL)
    fn.mockRejectedValueOnce(new Error('offline'))
    const c = start()
    await vi.advanceTimersByTimeAsync(1)
    expect(c.publish).toHaveBeenLastCalledWith({
      phase: 'error',
      lastSuccessfulAt: Date.now() - PAGE_REFRESH_INTERVAL - 1,
    })
    await vi.advanceTimersByTimeAsync(4 * 60_000)
    c.wake()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(['/account'])).toEqual(['saved'])
    c.reconnect()
    c.reconnect()
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('excludes inactive, disabled and unmanaged queries and defers editors', async () => {
    const active = observe('/account', Date.now() - PAGE_REFRESH_INTERVAL)
    const inactive = observe('/inactive', Date.now() - PAGE_REFRESH_INTERVAL)
    inactive.unsubscribe()
    const disabled = observe('/disabled', Date.now() - PAGE_REFRESH_INTERVAL)
    disabled.observer.setOptions({
      ...disabled.observer.options,
      enabled: false,
    })
    const privateRead = observe(
      '/user/tokens',
      Date.now() - PAGE_REFRESH_INTERVAL,
      false,
    )
    let editing = true
    const c = start({ defer: () => editing })
    expect(active.fn).not.toHaveBeenCalled()
    editing = false
    c.wake()
    await vi.advanceTimersByTimeAsync(1)
    expect(active.fn).toHaveBeenCalledTimes(1)
    expect(inactive.fn).not.toHaveBeenCalled()
    expect(privateRead.fn).not.toHaveBeenCalled()
    expect(disabled.fn).not.toHaveBeenCalled()
  })
  it('reconciles date before choosing overdue observers and cleans up timers', async () => {
    const { fn } = observe('/account', Date.now() - PAGE_REFRESH_INTERVAL)
    const reconcileDate = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValue(false)
    const c = start({ reconcileDate })
    expect(fn).not.toHaveBeenCalled()
    c.wake()
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(1)
    c.stop()
    await vi.advanceTimersByTimeAsync(PAGE_REFRESH_INTERVAL * 2)
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('does not report failures after the old page detaches', async () => {
    const old = observe('/account', Date.now() - PAGE_REFRESH_INTERVAL)
    old.fn.mockRejectedValue(new Error('late'))
    const c = start()
    old.unsubscribe()
    observe('/category')
    await vi.advanceTimersByTimeAsync(1)
    expect(c.publish.mock.lastCall?.[0].phase).toBe('idle')
  })
  it('picks up overdue reads on a newly observed page without refreshing detached pages', async () => {
    const old = observe('/account', Date.now())
    const upcoming = observe('/category', Date.now() - PAGE_REFRESH_INTERVAL)
    upcoming.unsubscribe()
    start()
    old.unsubscribe()
    cleanup.push(upcoming.observer.subscribe(() => {}))
    await vi.advanceTimersByTimeAsync(1000)
    expect(upcoming.fn).toHaveBeenCalledTimes(1)
    expect(old.fn).not.toHaveBeenCalled()
  })
  it('preserves loaded infinite pagination and never fetches an extra page', async () => {
    const fn = vi
      .fn()
      .mockImplementation(({ pageParam }: { pageParam: number }) =>
        Promise.resolve({ page: pageParam }),
      )
    const observer = new InfiniteQueryObserver(client, {
      queryKey: ['/transaction', 'infinite'],
      queryFn: fn,
      initialPageParam: 0,
      getNextPageParam: (last) => last.page + 1,
      initialData: { pages: [{ page: 0 }, { page: 1 }], pageParams: [0, 1] },
      initialDataUpdatedAt: Date.now() - PAGE_REFRESH_INTERVAL,
      staleTime: Infinity,
      ...pageReadPolicy,
    })
    cleanup.push(observer.subscribe(() => {}))
    start()
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(observer.getCurrentResult().data?.pageParams).toEqual([0, 1])
  })
  it('partial success keeps failed data timestamp in aggregate status', async () => {
    const savedAt = Date.now() - PAGE_REFRESH_INTERVAL
    const bad = observe('/account', savedAt)
    observe('/category', savedAt)
    bad.fn.mockRejectedValue(new Error('unavailable'))
    const c = start()
    await vi.advanceTimersByTimeAsync(1)
    expect(c.publish).toHaveBeenLastCalledWith({
      phase: 'error',
      lastSuccessfulAt: savedAt,
    })
    expect(client.getQueryState(['/category'])?.dataUpdatedAt).toBeGreaterThan(
      savedAt,
    )
  })
  it('refreshes observed Analysis drilldown reads with the same hourly policy', async () => {
    configureQueryPolicy(client)
    const fn = vi.fn().mockResolvedValue(['updated transaction'])
    const observer = new QueryObserver(client, {
      queryKey: [
        '/transaction-analysis/transactions',
        { categoryPrimary: 'FOOD_AND_DRINK' },
      ],
      queryFn: fn,
      initialData: ['saved transaction'],
      initialDataUpdatedAt: Date.now() - PAGE_REFRESH_INTERVAL,
      staleTime: Infinity,
    })
    cleanup.push(observer.subscribe(() => {}))
    expect(observer.options.refetchOnWindowFocus).toBe(false)
    expect(observer.options.refetchOnReconnect).toBe(false)
    start()
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledOnce()
    expect(observer.getCurrentResult().data).toEqual(['updated transaction'])
  })
  it('sets managed focus/reconnect policy without changing auth or notification policy', () => {
    configureQueryPolicy(client)
    expect(client.getQueryDefaults(['/account']).refetchOnWindowFocus).toBe(
      false,
    )
    expect(client.getQueryDefaults(['/account']).refetchOnReconnect).toBe(false)
    expect(
      client.getQueryDefaults(['/user/me']).refetchOnWindowFocus,
    ).toBeUndefined()
    expect(
      client.getQueryDefaults(['/notification/summary']).refetchOnReconnect,
    ).toBeUndefined()
  })
})

function homeRead(family: 'summary' | 'series', endDate = '2026-06-10') {
  const queryKey = [
    `/balance-query/dashboard-${family}`,
    { period: 'month', endDate },
  ]
  const fn = vi.fn().mockResolvedValue({ version: 'new' })
  const observer = new QueryObserver(client, {
    ...pageReadPolicy,
    queryKey,
    queryFn: fn,
    initialData: { version: 'saved' },
    initialDataUpdatedAt: Date.now(),
    staleTime: Infinity,
  })
  const unsubscribe = observer.subscribe(() => {})
  cleanup.push(unsubscribe)
  return { fn, observer, unsubscribe, queryKey }
}
describe('Home foreground intent', () => {
  it('refreshes fresh Home reads once, ignores ordinary focus, and permits each subsequent return', async () => {
    const summary = homeRead('summary')
    const series = homeRead('series')
    const detail = observe('/balance-query/balances')
    const c = start({ home: () => ({ endDate: '2026-06-10' }) })
    c.wake()
    c.wake()
    expect(summary.fn).not.toHaveBeenCalled()
    c.foreground()
    c.wake()
    c.reconnect()
    await vi.advanceTimersByTimeAsync(1)
    expect(summary.fn).toHaveBeenCalledTimes(1)
    expect(series.fn).toHaveBeenCalledTimes(1)
    expect(detail.fn).not.toHaveBeenCalled()
    c.foreground()
    await vi.advanceTimersByTimeAsync(1)
    expect(summary.fn).toHaveBeenCalledTimes(2)
    expect(series.fn).toHaveBeenCalledTimes(2)
  })
  it('joins in-flight launch reads without cancellation and retries a new return despite failure backoff', async () => {
    const summary = homeRead('summary')
    const series = homeRead('series')
    let finish!: () => void
    summary.fn.mockImplementationOnce(
      () =>
        new Promise<{ version: string }>((resolve) => {
          finish = () => resolve({ version: 'new' })
        }),
    )
    series.fn.mockRejectedValueOnce(new Error('unavailable'))
    const c = start({ home: () => ({ endDate: '2026-06-10' }) })
    const request = client.refetchQueries({ queryKey: summary.queryKey })
    c.foreground()
    c.wake()
    c.foreground()
    expect(summary.fn).toHaveBeenCalledTimes(1)
    finish()
    await request
    await vi.advanceTimersByTimeAsync(1)
    c.foreground()
    await vi.advanceTimersByTimeAsync(1)
    expect(summary.fn).toHaveBeenCalledTimes(2)
    expect(series.fn).toHaveBeenCalledTimes(2)
  })
  it('coalesces offline returns, including fresh reads without errors, until reconnect', async () => {
    let online = false
    const summary = homeRead('summary')
    const series = homeRead('series')
    const c = start({
      online: () => online,
      home: () => ({ endDate: '2026-06-10' }),
    })
    c.foreground()
    c.foreground()
    c.wake()
    expect(summary.fn).not.toHaveBeenCalled()
    online = true
    c.reconnect()
    c.wake()
    c.reconnect()
    await vi.advanceTimersByTimeAsync(1)
    expect(summary.fn).toHaveBeenCalledTimes(1)
    expect(series.fn).toHaveBeenCalledTimes(1)
  })
  it('retains deferred intent until editor release and discards it on leaving Home or stopping', async () => {
    let editing = true
    let onHome = true
    const summary = homeRead('summary')
    homeRead('series')
    const c = start({
      defer: () => editing,
      home: () => (onHome ? { endDate: '2026-06-10' } : null),
    })
    c.foreground()
    c.foreground()
    editing = false
    c.resumeDeferred()
    await vi.advanceTimersByTimeAsync(1)
    expect(summary.fn).toHaveBeenCalledTimes(1)
    editing = true
    c.foreground()
    onHome = false
    c.wake()
    onHome = true
    editing = false
    c.resumeDeferred()
    await vi.advanceTimersByTimeAsync(1)
    expect(summary.fn).toHaveBeenCalledTimes(1)
    editing = true
    c.foreground()
    c.stop()
    editing = false
    c.resumeDeferred()
    c.reconnect()
    await vi.advanceTimersByTimeAsync(1)
    expect(summary.fn).toHaveBeenCalledTimes(1)
  })
  it('waits through date reconciliation and joins newly started current-date reads', async () => {
    let endDate = '2026-06-10'
    const oldSummary = homeRead('summary')
    const oldSeries = homeRead('series')
    const reconcileDate = vi.fn().mockReturnValue(false)
    const c = start({ home: () => ({ endDate }), reconcileDate })
    reconcileDate.mockReturnValueOnce(true)
    c.foreground()
    c.wake()
    c.reconnect()
    expect(oldSummary.fn).not.toHaveBeenCalled()
    expect(oldSeries.fn).not.toHaveBeenCalled()
    endDate = '2026-06-11'
    oldSummary.unsubscribe()
    oldSeries.unsubscribe()
    const currentSummary = homeRead('summary', endDate)
    const currentSeries = homeRead('series', endDate)
    await client.refetchQueries({ queryKey: currentSummary.queryKey })
    await client.refetchQueries({ queryKey: currentSeries.queryKey })
    c.wake()
    await vi.advanceTimersByTimeAsync(1)
    expect(currentSummary.fn).toHaveBeenCalledTimes(1)
    expect(currentSeries.fn).toHaveBeenCalledTimes(1)
    expect(oldSummary.fn).not.toHaveBeenCalled()
  })
  it('does not prefetch Home on other pages or refresh disabled dashboard observers', async () => {
    const summary = homeRead('summary')
    const series = homeRead('series')
    series.observer.setOptions({ ...series.observer.options, enabled: false })
    let onHome = false
    const c = start({ home: () => (onHome ? { endDate: '2026-06-10' } : null) })
    c.foreground()
    expect(summary.fn).not.toHaveBeenCalled()
    onHome = true
    c.foreground()
    await vi.advanceTimersByTimeAsync(2000)
    expect(summary.fn).toHaveBeenCalledTimes(1)
    expect(series.fn).not.toHaveBeenCalled()
  })
})
