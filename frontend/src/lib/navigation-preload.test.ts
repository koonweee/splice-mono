import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PreparationQueue,
  createNavigationPreparation,
  destinationDataTasks,
  primaryDestinations,
} from './navigation-preload'
import {
  accountsQueryOptions,
  analysisDateRange,
  analysisQueryOptions,
  initialTransactionParams,
  transactionsQueryOptions,
} from './queries/primary'
import {
  dashboardSeriesOptions,
  dashboardSummaryOptions,
} from './queries/dashboard'
import { TimePeriod } from './types'

const auth = vi.hoisted(() => ({
  generation: 0,
  listeners: new Set<() => void>(),
}))
vi.mock('./auth-generation', () => ({
  getAuthGeneration: () => auth.generation,
  isPrivateUiBlocked: () => false,
  subscribeAuthBoundary: (listener: () => void) => {
    auth.listeners.add(listener)
    return () => auth.listeners.delete(listener)
  },
}))
vi.mock('./feature-loaders', () => ({
  loadChart: vi.fn(async () => {}),
  loadDonutChart: vi.fn(async () => {}),
  loadAnalysisSankeyChart: vi.fn(async () => {}),
}))
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function harness() {
  const callbacks: Array<() => void> = []
  let allowed = true,
    foregroundBusy = false
  const queue = new PreparationQueue({
    allowed: () => allowed,
    foregroundBusy: () => foregroundBusy,
    schedule: (callback) => {
      callbacks.push(callback)
      return () => {
        const index = callbacks.indexOf(callback)
        if (index >= 0) callbacks.splice(index, 1)
      }
    },
  })
  return {
    queue,
    tick: async () => {
      callbacks.shift()?.()
      await flush()
    },
    setAllowed: (value: boolean) => {
      allowed = value
    },
    setForeground: (value: boolean) => {
      foregroundBusy = value
    },
  }
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  auth.generation = 0
  auth.listeners.clear()
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: undefined,
  })
})
describe('bounded navigation preparation', () => {
  it('deduplicates work with at most two tasks and only one data task', async () => {
    const h = harness(),
      first = deferred(),
      second = deferred(),
      code = deferred()
    const dataA = vi.fn(() => first.promise),
      dataB = vi.fn(() => second.promise),
      module = vi.fn(() => code.promise)
    const tasks = [
      { key: 'a', kind: 'data' as const, run: dataA },
      { key: 'b', kind: 'data' as const, run: dataB },
      { key: 'code', kind: 'code' as const, run: module },
    ]
    h.queue.enqueue(tasks)
    h.queue.enqueue(tasks)
    await h.tick()
    expect(dataA).toHaveBeenCalledTimes(1)
    expect(module).toHaveBeenCalledTimes(1)
    expect(dataB).not.toHaveBeenCalled()
    code.resolve()
    await flush()
    await h.tick()
    expect(dataB).not.toHaveBeenCalled()
    first.resolve()
    await flush()
    await h.tick()
    expect(dataB).toHaveBeenCalledTimes(1)
    second.resolve()
    h.queue.stop()
  })
  it('pauses idle work while unavailable or foreground is busy; explicit intent bypasses the queue', async () => {
    const h = harness(),
      speculative = vi.fn(async () => {}),
      selected = vi.fn(async () => {})
    h.setAllowed(false)
    h.queue.enqueue([{ key: 'idle', kind: 'data', run: speculative }])
    await h.tick()
    expect(speculative).not.toHaveBeenCalled()
    h.setAllowed(true)
    h.setForeground(true)
    h.queue.wake()
    await h.tick()
    expect(speculative).not.toHaveBeenCalled()
    h.queue.prepareNow([{ key: 'selected', kind: 'data', run: selected }])
    await flush()
    expect(selected).toHaveBeenCalledOnce()
    h.setForeground(false)
    h.queue.wake()
    await h.tick()
    expect(speculative).toHaveBeenCalledOnce()
    h.queue.stop()
  })
  it('drops queued work without cancelling shared data and permits failed preparation retries', async () => {
    const h = harness(),
      running = deferred(),
      queued = vi.fn(async () => {})
    const failed = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    h.queue.prepareNow([{ key: 'retry', kind: 'code', run: failed }])
    await flush()
    h.queue.prepareNow([{ key: 'retry', kind: 'code', run: failed }])
    await flush()
    expect(failed).toHaveBeenCalledTimes(2)
    h.queue.enqueue([
      { key: 'active', kind: 'data', run: () => running.promise },
      { key: 'later', kind: 'data', run: queued },
    ])
    await h.tick()
    h.queue.stop()
    running.resolve()
    await flush()
    await h.tick()
    expect(queued).not.toHaveBeenCalled()
  })
  it('reuses loader parameters and only the first transaction page, never security data', async () => {
    const client = new QueryClient(),
      today = '2026-09-05'
    const query = vi
        .spyOn(client, 'prefetchQuery')
        .mockResolvedValue(undefined),
      infinite = vi
        .spyOn(client, 'prefetchInfiniteQuery')
        .mockResolvedValue(undefined)
    for (const destination of primaryDestinations)
      for (const task of destinationDataTasks(client, today, destination))
        await task.run()
    expect(query.mock.calls.map(([options]) => options.queryKey)).toEqual([
      dashboardSummaryOptions(TimePeriod.month, today).queryKey,
      dashboardSeriesOptions(TimePeriod.month, today).queryKey,
      analysisQueryOptions(analysisDateRange(today)).queryKey,
      accountsQueryOptions().queryKey,
    ])
    expect(infinite).toHaveBeenCalledOnce()
    expect(infinite.mock.calls[0][0]).toMatchObject({
      queryKey: transactionsQueryOptions(initialTransactionParams({})).queryKey,
      pages: 1,
    })
    expect(
      analysisDateRange(today, {
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      }),
    ).toEqual({ startDate: '2026-08-01', endDate: '2026-08-31' })
  })
  it('does not truncate or refetch additional pages in an already expanded transaction list', async () => {
    const client = new QueryClient()
    const options = transactionsQueryOptions(initialTransactionParams({}))
    client.setQueryData(options.queryKey, {
      pages: [
        {
          data: [],
          total: 75,
          pageIndex: null,
          pageSize: 50,
          nextCursor: 'cursor',
          hasMore: true,
        },
        {
          data: [],
          total: null,
          pageIndex: null,
          pageSize: 50,
          nextCursor: null,
          hasMore: false,
        },
      ],
      pageParams: [undefined, 'cursor'],
    })
    const fetch = vi
      .spyOn(client, 'prefetchInfiniteQuery')
      .mockResolvedValue(undefined)
    for (const task of destinationDataTasks(
      client,
      '2026-09-05',
      '/transactions',
    ))
      await task.run()
    expect(fetch).not.toHaveBeenCalled()
    expect(client.getQueryData(options.queryKey)?.pages).toHaveLength(2)
    client.clear()
  })

  it('waits for foreground chart code before starting idle code or data, while explicit intent remains immediate', async () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    client.setQueryData(['/user/me'], {
      id: 'u',
      settings: { currency: 'USD' },
    })
    const data = vi.spyOn(client, 'prefetchQuery').mockResolvedValue(undefined)
    vi.spyOn(client, 'prefetchInfiniteQuery').mockResolvedValue(undefined)
    const code = deferred()
    const loadRouteCode = vi.fn(() => Promise.resolve())
    const coordinator = createNavigationPreparation({
      client,
      today: '2026-09-05',
      identity: 'u',
      currency: 'USD',
      loadRouteCode,
      foregroundBusy: () => false,
      foregroundCode: code.promise,
    })
    await vi.advanceTimersByTimeAsync(1100)
    expect(loadRouteCode).not.toHaveBeenCalled()
    expect(data).not.toHaveBeenCalled()
    coordinator.prepare('/accounts')
    await flush()
    expect(loadRouteCode).toHaveBeenCalledExactlyOnceWith('/accounts')
    expect(data).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1100)
    expect(loadRouteCode).toHaveBeenCalledTimes(1)
    code.resolve()
    await flush()
    await vi.advanceTimersByTimeAsync(1100)
    expect(loadRouteCode).toHaveBeenCalledWith('/transactions')
    coordinator.stop()
    client.clear()
  })
  it('keeps the latest navigation code prioritized and resumes after failed code without deadlocking', async () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    client.setQueryData(['/user/me'], {
      id: 'u',
      settings: { currency: 'USD' },
    })
    vi.spyOn(client, 'prefetchQuery').mockResolvedValue(undefined)
    vi.spyOn(client, 'prefetchInfiniteQuery').mockResolvedValue(undefined)
    const first = deferred()
    let rejectNext!: (error: Error) => void
    const next = new Promise<void>((_resolve, reject) => {
      rejectNext = reject
    })
    const loadRouteCode = vi.fn(() => Promise.resolve())
    const coordinator = createNavigationPreparation({
      client,
      today: '2026-09-05',
      identity: 'u',
      currency: 'USD',
      loadRouteCode,
      foregroundBusy: () => false,
      foregroundCode: first.promise,
    })
    coordinator.prioritizeCode(next)
    first.resolve()
    await flush()
    await vi.advanceTimersByTimeAsync(1100)
    expect(loadRouteCode).not.toHaveBeenCalled()
    rejectNext(new Error('Offline chunk'))
    await flush()
    await vi.advanceTimersByTimeAsync(1100)
    expect(loadRouteCode).toHaveBeenCalled()
    coordinator.stop()
    client.clear()
  })
  it.each(['hidden', 'save-data'])(
    'skips idle work for %s but permits intent',
    async (mode) => {
      vi.useFakeTimers()
      if (mode === 'hidden')
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        })
      else
        Object.defineProperty(navigator, 'connection', {
          configurable: true,
          value: Object.assign(new EventTarget(), { saveData: true }),
        })
      const client = new QueryClient()
      client.setQueryData(['/user/me'], {
        id: 'u',
        settings: { currency: 'USD' },
      })
      vi.spyOn(client, 'prefetchQuery').mockResolvedValue(undefined)
      vi.spyOn(client, 'prefetchInfiniteQuery').mockResolvedValue(undefined)
      const loadRouteCode = vi.fn(async () => {})
      const coordinator = createNavigationPreparation({
        client,
        today: '2026-09-05',
        identity: 'u',
        currency: 'USD',
        loadRouteCode,
        foregroundBusy: () => false,
      })
      await vi.advanceTimersByTimeAsync(1100)
      expect(loadRouteCode).not.toHaveBeenCalled()
      coordinator.prepare('/accounts')
      await flush()
      expect(loadRouteCode).toHaveBeenCalledExactlyOnceWith('/accounts')
      coordinator.stop()
      client.clear()
    },
  )
  it.each(['generation', 'identity', 'currency'])(
    'discards preparation on %s replacement',
    async (boundary) => {
      vi.useFakeTimers()
      const client = new QueryClient()
      client.setQueryData(['/user/me'], {
        id: 'u',
        settings: { currency: 'USD' },
      })
      const loadRouteCode = vi.fn(async () => {})
      const coordinator = createNavigationPreparation({
        client,
        today: '2026-09-05',
        identity: 'u',
        currency: 'USD',
        loadRouteCode,
        foregroundBusy: () => false,
      })
      if (boundary === 'generation') {
        auth.generation++
        for (const listener of auth.listeners) listener()
      } else
        client.setQueryData(['/user/me'], {
          id: boundary === 'identity' ? 'other' : 'u',
          settings: { currency: boundary === 'currency' ? 'EUR' : 'USD' },
        })
      await vi.advanceTimersByTimeAsync(1100)
      coordinator.prepare('/accounts')
      await flush()
      expect(loadRouteCode).not.toHaveBeenCalled()
      coordinator.stop()
      client.clear()
    },
  )
})
