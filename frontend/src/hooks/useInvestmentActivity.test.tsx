import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInvestmentActivity } from './useInvestmentActivity'
import type { PropsWithChildren } from 'react'
import type * as SpliceAPI from '../api/clients/spliceAPI'
import type { InvestmentActivity } from '../api/models'

const mocks = vi.hoisted(() => ({
  investmentControllerFindActivityForAccount: vi.fn(),
}))

vi.mock('../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../api/clients/spliceAPI',
  )

  return {
    ...actual,
    investmentControllerFindActivityForAccount:
      mocks.investmentControllerFindActivityForAccount,
  }
})

beforeEach(() => {
  mocks.investmentControllerFindActivityForAccount.mockImplementation(
    (_accountId: string, params: { pageIndex: number; pageSize: number }) => {
      const start = params.pageIndex * params.pageSize
      const pageLength = Math.min(params.pageSize, 25 - start)
      return Promise.resolve({
        data: Array.from({ length: pageLength }, (_, index) => ({
          id: `activity-${start + index}`,
        })) as Array<InvestmentActivity>,
        total: 25,
        pageIndex: params.pageIndex,
        pageSize: params.pageSize,
      })
    },
  )
})

describe('useInvestmentActivity', () => {
  it('loads successive pages until every reported row is reachable', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useInvestmentActivity('account-1'), {
      wrapper,
    })

    await waitFor(() => expect(result.current.activity).toHaveLength(10))
    expect(result.current.total).toBe(25)
    expect(result.current.hasMore).toBe(true)

    await act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.activity).toHaveLength(20))
    expect(result.current.hasMore).toBe(true)

    await act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.activity).toHaveLength(25))
    expect(result.current.hasMore).toBe(false)
    expect(
      mocks.investmentControllerFindActivityForAccount,
    ).toHaveBeenLastCalledWith(
      'account-1',
      { pageIndex: 2, pageSize: 10 },
      expect.any(AbortSignal),
    )
  })

  it('retains loaded pages and recovers when a later page is retried', async () => {
    let failSecondPageOnce = true
    mocks.investmentControllerFindActivityForAccount.mockImplementation(
      (_accountId: string, params: { pageIndex: number; pageSize: number }) => {
        if (params.pageIndex === 1 && failSecondPageOnce) {
          failSecondPageOnce = false
          return Promise.reject(new Error('temporary provider failure'))
        }
        const start = params.pageIndex * params.pageSize
        const pageLength = Math.min(params.pageSize, 25 - start)
        return Promise.resolve({
          data: Array.from({ length: pageLength }, (_, index) => ({
            id: `activity-${start + index}`,
          })) as Array<InvestmentActivity>,
          total: 25,
          pageIndex: params.pageIndex,
          pageSize: params.pageSize,
        })
      },
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useInvestmentActivity('account-1'), {
      wrapper,
    })

    await waitFor(() => expect(result.current.activity).toHaveLength(10))

    await act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.isLoadMoreError).toBe(true))
    expect(result.current.activity).toHaveLength(10)
    expect(result.current.total).toBe(25)
    expect(result.current.hasMore).toBe(true)

    await act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.activity).toHaveLength(20))
    expect(result.current.isLoadMoreError).toBe(false)

    await act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.activity).toHaveLength(25))
    expect(result.current.hasMore).toBe(false)
  })
})
