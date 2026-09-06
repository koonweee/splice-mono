import { infiniteQueryOptions } from '@tanstack/react-query'
import {
  getAccountControllerFindAllQueryOptions,
  getCategoryControllerFindAllQueryOptions,
  getCategoryControllerFindFilterOptionsQueryOptions,
  getTransactionAnalysisControllerGetAnalysisQueryOptions,
  getTransactionControllerFindAllQueryKey,
  transactionControllerFindAll,
} from '../../api/clients/spliceAPI'
import { FINANCIAL_STALE_TIME } from '../query-policy'
import type { TransactionControllerFindAllParams } from '../../api/models'

export const PAGE_SIZE = 50
export const accountsQueryOptions = () =>
  getAccountControllerFindAllQueryOptions({
    query: { staleTime: FINANCIAL_STALE_TIME },
  })
export const categoriesQueryOptions = () =>
  getCategoryControllerFindAllQueryOptions({
    query: { staleTime: FINANCIAL_STALE_TIME },
  })
export const categoryFiltersQueryOptions = () =>
  getCategoryControllerFindFilterOptionsQueryOptions({
    query: { staleTime: FINANCIAL_STALE_TIME },
  })
export const analysisQueryOptions = (params: {
  startDate: string
  endDate: string
}) =>
  getTransactionAnalysisControllerGetAnalysisQueryOptions(params, {
    query: { staleTime: FINANCIAL_STALE_TIME },
  })
export function transactionsQueryOptions(
  params: Omit<
    TransactionControllerFindAllParams,
    'pageIndex' | 'cursor' | 'includeTotal'
  >,
) {
  return infiniteQueryOptions({
    queryKey: [...getTransactionControllerFindAllQueryKey(params), 'infinite'],
    queryFn: ({ pageParam, signal }) =>
      transactionControllerFindAll({ ...params, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
    staleTime: FINANCIAL_STALE_TIME,
  })
}
export function initialTransactionParams(search: {
  accountId?: string
  categoryId?: string
  startDate?: string
  endDate?: string
}): TransactionControllerFindAllParams {
  return {
    pageSize: String(PAGE_SIZE),
    convert: true,
    sortBy: 'activityDate',
    sortOrder: 'DESC',
    ...(search.accountId ? { accountId: search.accountId } : {}),
    ...(search.categoryId ? { categoryId: search.categoryId } : {}),
    ...(search.startDate && search.endDate
      ? { startDate: search.startDate, endDate: search.endDate }
      : {}),
  }
}

export function analysisDateRange(
  today: string,
  search: { startDate?: string; endDate?: string } = {},
) {
  return {
    startDate: search.startDate ?? `${today.slice(0, 7)}-01`,
    endDate: search.endDate ?? today,
  }
}
