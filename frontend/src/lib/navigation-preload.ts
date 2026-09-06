import {
  getAuthGeneration,
  isPrivateUiBlocked,
  subscribeAuthBoundary,
} from './auth-generation'
import {
  loadAnalysisSankeyChart,
  loadChart,
  loadDonutChart,
} from './feature-loaders'
import {
  dashboardSeriesOptions,
  dashboardSummaryOptions,
} from './queries/dashboard'
import {
  accountsQueryOptions,
  analysisDateRange,
  analysisQueryOptions,
  initialTransactionParams,
  transactionsQueryOptions,
} from './queries/primary'
import { TimePeriod } from './types'
import type { QueryClient } from '@tanstack/react-query'
import type { User } from '../api/models'

export const primaryDestinations = [
  '/home',
  '/transactions',
  '/analysis',
  '/accounts',
  '/settings',
] as const
export type PrimaryDestination = (typeof primaryDestinations)[number]
type PreparationTask = {
  key: string
  kind: 'code' | 'data'
  run: () => Promise<unknown>
}
export type IdleScheduler = (callback: () => void) => () => void

export const browserIdleScheduler: IdleScheduler = (callback) => {
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout: 1000 })
    return () => window.cancelIdleCallback(id)
  }
  // A bounded scheduling fallback, not a delay imposed on navigation.
  const id = setTimeout(callback, 0)
  return () => clearTimeout(id)
}

/** The queue owns speculative work only. Foreground loaders never wait for it,
 * and disposal never cancels a Query request another observer may now need. */
export class PreparationQueue {
  private queued: Array<PreparationTask> = []
  private running = new Map<string, Promise<unknown>>()
  private dataRunning = 0
  private cancelIdle?: () => void
  private stopped = false
  constructor(
    private readonly options: {
      schedule: IdleScheduler
      allowed: () => boolean
      foregroundBusy: () => boolean
    },
  ) {}

  enqueue(tasks: Array<PreparationTask>) {
    if (this.stopped) return
    for (const task of tasks) {
      if (
        !this.queued.some((item) => item.key === task.key) &&
        !this.running.has(task.key)
      )
        this.queued.push(task)
    }
    this.wake()
  }
  wake() {
    if (
      this.stopped ||
      this.cancelIdle ||
      !this.queued.length ||
      !this.options.allowed() ||
      this.options.foregroundBusy()
    )
      return
    this.cancelIdle = this.options.schedule(() => {
      this.cancelIdle = undefined
      this.drain()
    })
  }
  private drain() {
    if (
      this.stopped ||
      !this.options.allowed() ||
      this.options.foregroundBusy()
    )
      return
    while (this.running.size < 2) {
      const index = this.queued.findIndex(
        (task) => task.kind === 'code' || this.dataRunning === 0,
      )
      if (index < 0) return
      const [task] = this.queued.splice(index, 1)
      this.run(task)
    }
  }
  private run(task: PreparationTask) {
    if (task.kind === 'data') this.dataRunning++
    const promise = Promise.resolve()
      .then(task.run)
      .catch(() => undefined)
    this.running.set(task.key, promise)
    void promise.finally(() => {
      this.running.delete(task.key)
      if (task.kind === 'data') this.dataRunning--
      this.wake()
    })
    return promise
  }
  prepareNow(tasks: Array<PreparationTask>) {
    if (this.stopped) return
    // Intent is allowed even on Save-Data or a busy page, outside idle limits.
    for (const task of tasks) {
      this.queued = this.queued.filter((item) => item.key !== task.key)
      if (!this.running.has(task.key)) this.run(task)
    }
  }
  stop() {
    this.stopped = true
    this.cancelIdle?.()
    this.cancelIdle = undefined
    this.queued = []
  }
}

export function destinationDataTasks(
  client: QueryClient,
  today: string,
  destination: PrimaryDestination,
): Array<PreparationTask> {
  const task = (key: string, run: () => Promise<unknown>): PreparationTask => ({
    key,
    kind: 'data',
    run,
  })
  switch (destination) {
    case '/home':
      return [
        task('home-summary', () =>
          client.prefetchQuery(
            dashboardSummaryOptions(TimePeriod.month, today),
          ),
        ),
        task('home-series', () =>
          client.prefetchQuery(dashboardSeriesOptions(TimePeriod.month, today)),
        ),
      ]
    case '/transactions':
      return [
        task('transactions', () => {
          const options = transactionsQueryOptions(initialTransactionParams({}))
          // Do not refresh extra pages or truncate a user's already loaded list.
          if ((client.getQueryData(options.queryKey)?.pages.length ?? 0) > 1)
            return Promise.resolve()
          return client.prefetchInfiniteQuery({ ...options, pages: 1 })
        }),
      ]
    case '/analysis':
      return [
        task('analysis', () =>
          client.prefetchQuery(analysisQueryOptions(analysisDateRange(today))),
        ),
      ]
    case '/accounts':
      return [
        task('accounts', () => client.prefetchQuery(accountsQueryOptions())),
      ]
    case '/settings':
      return []
  }
}

export function createNavigationPreparation(options: {
  client: QueryClient
  today: string
  identity: string
  currency: string | undefined
  loadRouteCode: (destination: PrimaryDestination) => Promise<unknown>
  foregroundBusy: () => boolean
  foregroundCode?: Promise<unknown>
}) {
  const { client } = options
  const generation = getAuthGeneration()
  const scopeMatches = () => {
    const user = client.getQueryData<User>(['/user/me'])
    return (
      !isPrivateUiBlocked() &&
      getAuthGeneration() === generation &&
      user?.id === options.identity &&
      user.settings.currency === options.currency
    )
  }
  let foregroundCodeVersion = 0
  let foregroundCodePending = false
  const queue = new PreparationQueue({
    schedule: browserIdleScheduler,
    allowed: () =>
      scopeMatches() &&
      document.visibilityState !== 'hidden' &&
      !(navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData,
    foregroundBusy: () => foregroundCodePending || options.foregroundBusy(),
  })
  const prioritizeCode = (ready: Promise<unknown>) => {
    const version = ++foregroundCodeVersion
    foregroundCodePending = true
    const settled = () => {
      if (version !== foregroundCodeVersion) return
      foregroundCodePending = false
      queue.wake()
    }
    // A failed module still allows later idle work and the local feature error UI.
    void ready.then(settled, settled)
  }
  if (options.foregroundCode) prioritizeCode(options.foregroundCode)
  const guarded = (task: PreparationTask): PreparationTask => ({
    ...task,
    run: () => (scopeMatches() ? task.run() : Promise.resolve()),
  })
  const tasks = (destination: PrimaryDestination) =>
    [
      {
        key: `route:${destination}`,
        kind: 'code' as const,
        run: () => options.loadRouteCode(destination),
      },
      ...destinationDataTasks(client, options.today, destination),
    ].map(guarded)
  const unsubscribeAuth = subscribeAuthBoundary(() => queue.stop())
  const unsubscribeQueries = client.getQueryCache().subscribe(() => {
    if (!scopeMatches()) queue.stop()
    else queue.wake()
  })
  const visibility = () => queue.wake()
  document.addEventListener('visibilitychange', visibility)
  const connection = (navigator as Navigator & { connection?: EventTarget })
    .connection
  connection?.addEventListener('change', visibility)
  queue.enqueue([
    ...primaryDestinations.flatMap(tasks),
    { key: 'chart', kind: 'code', run: loadChart },
    { key: 'donut', kind: 'code', run: loadDonutChart },
    { key: 'sankey', kind: 'code', run: loadAnalysisSankeyChart },
  ])
  return {
    prioritizeCode,
    prepare: (destination: PrimaryDestination) => {
      if (scopeMatches()) queue.prepareNow(tasks(destination))
    },
    wake: () => queue.wake(),
    stop: () => {
      queue.stop()
      unsubscribeAuth()
      unsubscribeQueries()
      document.removeEventListener('visibilitychange', visibility)
      connection?.removeEventListener('change', visibility)
    },
  }
}
