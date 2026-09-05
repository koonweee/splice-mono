import {
  MutationObserver,
  QueryClient,
  QueryObserver,
} from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  belongsToFamily,
  createMutationCache,
  invalidateMutationFamilies,
} from './query-invalidation'
import { clearPrivateCaches } from './auth-generation'
import { configureQueryPolicy } from './query-policy'

const clients: Array<QueryClient> = []
function createClient() {
  const client: QueryClient = new QueryClient({
    mutationCache: createMutationCache(() => client),
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })
  configureQueryPolicy(client)
  clients.push(client)
  return client
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}
const account = {
  id: 'account-a',
  type: 'depository',
  name: 'Original',
  notes: 'Before',
  customName: null,
  currentBalance: { money: { amount: 500, currency: 'USD' }, sign: 'positive' },
}
const accountKey = ['/account']
const summaryKey = ['/balance-query/dashboard-summary', { period: 'month' }]
function seed(client: QueryClient) {
  client.setQueryData(accountKey, [account])
  client.setQueryData(summaryKey, {
    netWorth: account.currentBalance,
    assets: [{ ...account, effectiveBalance: account.currentBalance }],
    liabilities: [],
  })
  client.setQueryData(
    ['/balance-query/balances', { accountId: account.id }],
    [{ account, effectiveBalance: account.currentBalance }],
  )
}
function rename(
  client: QueryClient,
  response: ReturnType<typeof deferred<typeof account>>,
) {
  return new MutationObserver(client, {
    mutationKey: ['accountControllerUpdate'],
    scope: { id: `account-metadata:${account.id}` },
    mutationFn: (_variables: {
      id: string
      data: { name?: string; notes?: string }
    }) => response.promise,
  })
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
})

describe('mutation reconciliation', () => {
  it('uses URL families, not accidental substring matches', () => {
    expect(belongsToFamily(['/transaction/123'], ['transactions'])).toBe(true)
    expect(
      belongsToFamily(['/transaction-analysis/audit'], ['transactions']),
    ).toBe(false)
    expect(
      belongsToFamily(['/unrelated-transaction/report'], ['transactions']),
    ).toBe(false)
  })

  it('invalidates every filtered variant without inventing membership or changing balances', async () => {
    const client = createClient()
    const keys = [
      ['/transaction', { categoryId: 'a' }],
      ['/transaction', { categoryId: 'b' }],
      ['/transaction-analysis/audit'],
      ['/category/filter-options'],
      ['/categorization-rules'],
    ]
    keys.forEach((key) =>
      client.setQueryData(key, { rows: ['original'], total: 1 }),
    )
    client.setQueryData(summaryKey, { total: 500 })
    client.setQueryData(['/unrelated-transaction'], 'keep')
    await client
      .getMutationCache()
      .build(client, {
        mutationKey: ['transactionControllerBulkUpdateCategories'],
        mutationFn: () => Promise.resolve({ updated: 1 }),
      })
      .execute(undefined)
    keys.forEach((key) => {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true)
      expect(client.getQueryData(key)).toEqual({ rows: ['original'], total: 1 })
    })
    expect(client.getQueryState(summaryKey)?.isInvalidated).toBe(false)
    expect(
      client.getQueryState(['/unrelated-transaction'])?.isInvalidated,
    ).toBe(false)
  })

  it('cancels an old in-flight read, refetches active data once, and leaves inactive variants stale', async () => {
    const client = createClient()
    const old = deferred<string>()
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValue('after edit')
    const observer = new QueryObserver(client, {
      queryKey: ['/transaction'],
      queryFn: fetch,
    })
    const unsubscribe = observer.subscribe(() => {})
    client.setQueryData(['/transaction', { page: 2 }], 'inactive')
    await flush()
    await client
      .getMutationCache()
      .build(client, {
        mutationKey: ['transactionControllerUpdateManual'],
        mutationFn: () => Promise.resolve('saved'),
        onSuccess: () => invalidateMutationFamilies(client, ['transactions']),
      })
      .execute(undefined)
    old.resolve('obsolete')
    await flush()
    expect(client.getQueryData(['/transaction'])).toBe('after edit')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(
      client.getQueryState(['/transaction', { page: 2 }])?.isInvalidated,
    ).toBe(true)
    unsubscribe()
  })

  it('optimistically patches metadata across views and rolls back a failed edit', async () => {
    const client = createClient()
    seed(client)
    const response = deferred<typeof account>()
    const mutation = rename(client, response)
    const result = mutation
      .mutate({ id: account.id, data: { name: 'Draft' } })
      .catch((error: unknown) => error)
    await flush()
    expect(
      client.getQueryData<Array<typeof account>>(accountKey)?.[0].name,
    ).toBe('Draft')
    expect(
      client.getQueryData<{ assets: Array<typeof account> }>(summaryKey)
        ?.assets[0].name,
    ).toBe('Draft')
    expect(
      client.getQueryData<{ netWorth: unknown }>(summaryKey)?.netWorth,
    ).toEqual(account.currentBalance)
    response.reject(new Error('offline'))
    await result
    expect(
      client.getQueryData<Array<typeof account>>(accountKey)?.[0].name,
    ).toBe('Original')
    expect(
      client.getQueryData<{ assets: Array<typeof account> }>(summaryKey)
        ?.assets[0].name,
    ).toBe('Original')
  })

  it('serializes overlapping writes and preserves a later edit after an earlier failure', async () => {
    const client = createClient()
    seed(client)
    const first = deferred<typeof account>()
    const second = deferred<typeof account>()
    const one = rename(client, first)
    const two = rename(client, second)
    const p1 = one
      .mutate({ id: account.id, data: { name: 'First' } })
      .catch((error: unknown) => error)
    const p2 = two.mutate({ id: account.id, data: { name: 'Second' } })
    await flush()
    expect(two.getCurrentResult().isPaused).toBe(true)
    expect(
      client.getQueryData<Array<typeof account>>(accountKey)?.[0].name,
    ).toBe('Second')
    first.reject(new Error('first failed'))
    await p1
    await flush()
    expect(
      client.getQueryData<Array<typeof account>>(accountKey)?.[0].name,
    ).toBe('Second')
    second.resolve({ ...account, name: 'Second' })
    await p2
    expect(
      client.getQueryData<Array<typeof account>>(accountKey)?.[0].name,
    ).toBe('Second')
  })

  it('rolls two failed optimistic writes back to the original confirmed metadata', async () => {
    const client = createClient()
    seed(client)
    const first = deferred<typeof account>()
    const second = deferred<typeof account>()
    const p1 = rename(client, first)
      .mutate({ id: account.id, data: { name: 'First' } })
      .catch((error: unknown) => error)
    const p2 = rename(client, second)
      .mutate({ id: account.id, data: { name: 'Second' } })
      .catch((error: unknown) => error)
    await flush()
    first.reject(new Error('one'))
    await p1
    second.reject(new Error('two'))
    await p2
    expect(
      client.getQueryData<Array<typeof account>>(accountKey)?.[0].name,
    ).toBe('Original')
  })

  it('discards late successful replies and skips hook callbacks after identity change', async () => {
    const client = createClient()
    seed(client)
    const response = deferred<typeof account>()
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const onSettled = vi.fn()
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ['accountControllerUpdate'],
      mutationFn: () => response.promise,
      onSuccess,
      onError,
      onSettled,
    })
    const result = mutation
      .execute({ id: account.id, data: { name: 'Old identity' } })
      .catch((error: unknown) => error)
    await flush()
    clearPrivateCaches(false)
    client.clear()
    response.resolve({ ...account, name: 'Late' })
    expect(await result).toMatchObject({ name: 'AbortError' })
    expect(client.getQueryData(accountKey)).toBeUndefined()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(onSettled).not.toHaveBeenCalled()
  })

  it('clears old currency data for active observers before publishing the new user currency', async () => {
    const client = createClient()
    const user = {
      id: 'user-a',
      settings: { currency: 'USD', neutralizationLookaroundDays: 60 },
    }
    client.setQueryData(['/user/me'], user)
    client.setQueryData(summaryKey, { currency: 'USD', total: 500 })
    client.setQueryData(['/transaction-analysis', { month: 1 }], {
      currency: 'USD',
      total: 500,
    })
    const next = deferred<{ currency: string; total: number }>()
    const observer = new QueryObserver(client, {
      queryKey: summaryKey,
      queryFn: () => next.promise,
    })
    const states: Array<unknown> = []
    const unsubscribe = observer.subscribe((state) => states.push(state.data))
    const result = client
      .getMutationCache()
      .build(client, {
        mutationKey: ['userControllerUpdateSettings'],
        mutationFn: () =>
          Promise.resolve({ ...user.settings, currency: 'EUR' }),
      })
      .execute(undefined)
    await flush()
    expect(observer.getCurrentResult().data).toBeUndefined()
    expect(
      client.getQueryData(['/transaction-analysis', { month: 1 }]),
    ).toBeUndefined()
    expect(
      client.getQueryData<typeof user>(['/user/me'])?.settings.currency,
    ).toBe('EUR')
    next.resolve({ currency: 'EUR', total: 450 })
    await result
    expect(observer.getCurrentResult().data).toEqual({
      currency: 'EUR',
      total: 450,
    })
    expect(states).toContain(undefined)
    unsubscribe()
  })

  it('merges the authoritative UserSettings response and refreshes only analysis after a lookaround edit', async () => {
    const client = createClient()
    const user = {
      id: 'owner',
      name: 'Owner',
      email: 'owner@example.test',
      settings: {
        currency: 'USD',
        theme: 'splice-dark',
        neutralizationLookaroundDays: 60,
      },
    }
    client.setQueryData(['/user/me'], user)
    client.setQueryData(['/transaction-analysis'], { total: 10 })
    client.setQueryData(summaryKey, { total: 500 })
    const settings = { ...user.settings, neutralizationLookaroundDays: 90 }
    await client
      .getMutationCache()
      .build(client, {
        mutationKey: ['userControllerUpdateSettings'],
        mutationFn: () => Promise.resolve(settings),
      })
      .execute({ data: { neutralizationLookaroundDays: 90 } })
    expect(client.getQueryData(['/user/me'])).toEqual({ ...user, settings })
    expect(client.getQueryState(['/transaction-analysis'])?.isInvalidated).toBe(
      true,
    )
    expect(client.getQueryState(summaryKey)?.isInvalidated).toBe(false)
  })

  it('refuses to merge a delayed settings response into a replacement canonical user', async () => {
    const client = createClient()
    client.setQueryData(['/user/me'], {
      id: 'alice',
      settings: { currency: 'USD' },
    })
    const response = deferred<{ currency: string }>()
    const write = client
      .getMutationCache()
      .build(client, {
        mutationKey: ['userControllerUpdateSettings'],
        mutationFn: () => response.promise,
      })
      .execute({ data: { currency: 'EUR' } })
      .catch((error: unknown) => error)
    await flush()
    client.setQueryData(['/user/me'], {
      id: 'bob',
      settings: { currency: 'GBP' },
    })
    response.resolve({ currency: 'EUR' })
    expect(await write).toMatchObject({ name: 'AbortError' })
    expect(client.getQueryData(['/user/me'])).toEqual({
      id: 'bob',
      settings: { currency: 'GBP' },
    })
  })

  it('new recurring schedules refresh transactions because creation can materialize a due occurrence', async () => {
    const client = createClient()
    client.setQueryData(['/recurring-manual-transaction'], [])
    client.setQueryData(['/transaction'], { rows: [], total: 0 })
    client.setQueryData(summaryKey, { total: 500 })
    await client
      .getMutationCache()
      .build(client, {
        mutationKey: ['recurringManualTransactionControllerCreate'],
        mutationFn: () => Promise.resolve({}),
      })
      .execute(undefined)
    expect(client.getQueryState(['/transaction'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(summaryKey)?.isInvalidated).toBe(false)
  })

  it('schedule edits invalidate schedules without claiming materialized transactions changed', async () => {
    const client = createClient()
    client.setQueryData(['/recurring-manual-transaction'], [])
    client.setQueryData(['/transaction'], { rows: [], total: 0 })
    await client
      .getMutationCache()
      .build(client, {
        mutationKey: ['recurringManualTransactionControllerPause'],
        mutationFn: () => Promise.resolve({}),
      })
      .execute(undefined)
    expect(
      client.getQueryState(['/recurring-manual-transaction'])?.isInvalidated,
    ).toBe(true)
    expect(client.getQueryState(['/transaction'])?.isInvalidated).toBe(false)
  })
})
