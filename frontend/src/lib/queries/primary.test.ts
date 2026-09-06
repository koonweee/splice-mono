import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { transactionControllerFindAll } from '../../api/clients/spliceAPI'
import { initialTransactionParams, transactionsQueryOptions } from './primary'
import type * as SpliceApi from '../../api/clients/spliceAPI'

vi.mock('../../api/clients/spliceAPI', async (importOriginal) => ({
  ...(await importOriginal<typeof SpliceApi>()),
  transactionControllerFindAll: vi.fn(),
}))

afterEach(() => vi.clearAllMocks())

describe('transaction cursor queries', () => {
  it('keeps the first exact total and follows cursors until the final page', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const findAll = vi.mocked(transactionControllerFindAll)
    findAll.mockResolvedValueOnce({
      data: [],
      total: 75,
      pageIndex: null,
      pageSize: 50,
      nextCursor: 'next-page',
      hasMore: true,
    })
    findAll.mockResolvedValueOnce({
      data: [],
      total: null,
      pageIndex: null,
      pageSize: 50,
      nextCursor: null,
      hasMore: false,
    })
    const params = initialTransactionParams({ accountId: 'account-a' })
    const options = transactionsQueryOptions(params)
    const result = await client.fetchInfiniteQuery({ ...options, pages: 3 })
    expect(result.pages).toHaveLength(2)
    expect(result.pages[0].total).toBe(75)
    expect(result.pageParams).toEqual([undefined, 'next-page'])
    expect(findAll).toHaveBeenNthCalledWith(
      1,
      { ...params, cursor: undefined },
      expect.any(AbortSignal),
    )
    expect(findAll).toHaveBeenNthCalledWith(
      2,
      { ...params, cursor: 'next-page' },
      expect.any(AbortSignal),
    )
    await client.fetchInfiniteQuery(options)
    expect(findAll).toHaveBeenCalledTimes(2)
    client.clear()
  })

  it('starts a changed filter at its own initial page', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const findAll = vi.mocked(transactionControllerFindAll)
    findAll.mockResolvedValue({
      data: [],
      total: 0,
      pageIndex: null,
      pageSize: 50,
      nextCursor: null,
      hasMore: false,
    })
    await client.fetchInfiniteQuery(
      transactionsQueryOptions(
        initialTransactionParams({ accountId: 'account-a' }),
      ),
    )
    await client.fetchInfiniteQuery(
      transactionsQueryOptions(
        initialTransactionParams({ accountId: 'account-b' }),
      ),
    )
    expect(findAll).toHaveBeenCalledTimes(2)
    expect(findAll.mock.calls.map(([params]) => params?.cursor)).toEqual([
      undefined,
      undefined,
    ])
    expect(findAll.mock.calls[1][0]).toMatchObject({ accountId: 'account-b' })
    client.clear()
  })
})
