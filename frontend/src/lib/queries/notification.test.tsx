import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearPrivateCaches } from '../auth-generation'
import { createMutationCache } from '../query-invalidation'
import {
  notificationInboxQueryOptions,
  notificationSummaryQueryOptions,
  useClearNotifications,
  useNotificationAction,
} from './notification'
import type { ReactNode } from 'react'

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  inbox: vi.fn(),
  read: vi.fn(),
  archive: vi.fn(),
  archiveAll: vi.fn(),
}))
vi.mock('../../api/clients/spliceAPI', () => ({
  notificationControllerGetSummary: api.summary,
  notificationControllerGetInbox: api.inbox,
  notificationControllerMarkRead: api.read,
  notificationControllerArchive: api.archive,
  notificationControllerArchiveAll: api.archiveAll,
}))
const clients: Array<QueryClient> = []
const item = {
  id: 'one',
  type: 'transactions.new_synced' as const,
  title: 'Synced',
  body: '2 transactions',
  url: '/transactions',
  createdAt: '2026-09-06T12:00:00Z',
  readAt: null,
}
const page = { items: [item], nextCursor: null, hasMore: false }
function client(managed = false) {
  const result: QueryClient = new QueryClient({
    mutationCache: managed ? createMutationCache(() => result) : undefined,
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })
  clients.push(result)
  return result
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function action(queryClient: QueryClient) {
  return renderHook(() => useNotificationAction(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}
function clear(queryClient: QueryClient) {
  return renderHook(() => useClearNotifications(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((value) => value.clear())
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

describe('notification queries', () => {
  it('deduplicates summary consumers and preserves distinct count semantics', async () => {
    const queryClient = client()
    api.summary.mockResolvedValue({
      unreadNotificationCount: 2,
      uncategorizedTransactionCount: 12,
      computedAt: '2026-09-06T12:00:00Z',
    })
    const responses = await Promise.all([
      queryClient.fetchQuery(notificationSummaryQueryOptions()),
      queryClient.fetchQuery(notificationSummaryQueryOptions()),
    ])
    expect(api.summary).toHaveBeenCalledOnce()
    expect(responses[0]).toMatchObject({
      unreadNotificationCount: 2,
      uncategorizedTransactionCount: 12,
    })
    expect(responses[1]).toBe(responses[0])
  })
  it('follows server cursors without inventing page offsets', async () => {
    const queryClient = client()
    api.inbox
      .mockResolvedValueOnce({ ...page, nextCursor: 'next', hasMore: true })
      .mockResolvedValueOnce({ ...page, items: [] })
    const result = await queryClient.fetchInfiniteQuery({
      ...notificationInboxQueryOptions(),
      pages: 3,
    })
    expect(result.pages).toHaveLength(2)
    expect(result.pageParams).toEqual([undefined, 'next'])
    expect(api.inbox).toHaveBeenLastCalledWith(
      { cursor: 'next', pageSize: 20 },
      expect.any(AbortSignal),
    )
  })
  it.each([false, true])(
    'applies a confirmed read and archive with managed cache=%s without changing transaction count',
    async (managed) => {
      const queryClient = client(managed)
      const inboxKey = notificationInboxQueryOptions().queryKey
      queryClient.setQueryData(inboxKey, {
        pages: [page],
        pageParams: [undefined],
      })
      queryClient.setQueryData(notificationSummaryQueryOptions().queryKey, {
        unreadNotificationCount: 2,
        uncategorizedTransactionCount: 12,
        computedAt: '2026-09-06T12:00:00Z',
      })
      api.read.mockResolvedValue(undefined)
      api.archive.mockResolvedValue(undefined)
      const { result } = action(queryClient)
      await act(async () => {
        await result.current.mutateAsync({ id: item.id, action: 'read' })
      })
      expect(queryClient.getQueryData(inboxKey)?.pages[0].items).toEqual([])
      expect(
        queryClient.getQueryData(notificationSummaryQueryOptions().queryKey)
          ?.uncategorizedTransactionCount,
      ).toBe(12)
      expect(
        queryClient.getQueryState(notificationSummaryQueryOptions().queryKey)
          ?.isInvalidated,
      ).toBe(true)
      await act(async () => {
        await result.current.mutateAsync({ id: item.id, action: 'archive' })
      })
      expect(queryClient.getQueryData(inboxKey)?.pages[0].items).toEqual([])
    },
  )
  it('retains rows on a failed write and never queues an offline action', async () => {
    const queryClient = client()
    const inboxKey = notificationInboxQueryOptions().queryKey
    queryClient.setQueryData(inboxKey, {
      pages: [page],
      pageParams: [undefined],
    })
    api.archive.mockRejectedValue(new Error('Service unavailable'))
    const { result } = action(queryClient)
    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: item.id, action: 'archive' }),
      ).rejects.toThrow('Service unavailable')
    })
    expect(queryClient.getQueryData(inboxKey)?.pages[0].items).toEqual([item])
    vi.stubGlobal('navigator', { onLine: false })
    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: item.id, action: 'read' }),
      ).rejects.toThrow('Reconnect')
    })
    expect(api.read).not.toHaveBeenCalled()
    expect(result.current.isPaused).toBe(false)
  })
  it.each([false, true])(
    'clears every cached page with managed cache=%s and preserves transaction count',
    async (managed) => {
      const queryClient = client(managed)
      const inboxKey = notificationInboxQueryOptions().queryKey
      const summaryKey = notificationSummaryQueryOptions().queryKey
      queryClient.setQueryData(inboxKey, {
        pages: [
          { ...page, nextCursor: 'next', hasMore: true },
          { ...page, items: [{ ...item, id: 'two' }] },
        ],
        pageParams: [undefined, 'next'],
      })
      queryClient.setQueryData(summaryKey, {
        unreadNotificationCount: 2,
        uncategorizedTransactionCount: 12,
        computedAt: '2026-09-06T12:00:00Z',
      })
      api.archiveAll.mockResolvedValue(undefined)
      const { result } = clear(queryClient)

      await act(async () => {
        await result.current.mutateAsync()
      })

      expect(api.archiveAll).toHaveBeenCalledOnce()
      expect(queryClient.getQueryData(inboxKey)).toMatchObject({
        pages: [{ items: [], nextCursor: null, hasMore: false }],
        pageParams: [undefined],
      })
      expect(queryClient.getQueryData(summaryKey)).toMatchObject({
        unreadNotificationCount: 0,
        uncategorizedTransactionCount: 12,
      })
      expect(queryClient.getQueryState(summaryKey)?.isInvalidated).toBe(true)
    },
  )
  it('rejects an old identity response before patching a replacement inbox', async () => {
    const queryClient = client()
    const delayed = deferred()
    api.read.mockReturnValue(delayed.promise)
    const { result } = action(queryClient)
    await act(async () => {
      const pending = result.current.mutateAsync({
        id: item.id,
        action: 'read',
      })
      const rejected = expect(pending).rejects.toThrow('Session changed')
      await vi.waitFor(() => expect(api.read).toHaveBeenCalledOnce())
      clearPrivateCaches(false)
      queryClient.setQueryData(notificationInboxQueryOptions().queryKey, {
        pages: [page],
        pageParams: [undefined],
      })
      delayed.resolve()
      await rejected
    })
    expect(
      queryClient.getQueryData(notificationInboxQueryOptions().queryKey)
        ?.pages[0].items[0].readAt,
    ).toBeNull()
  })
})
