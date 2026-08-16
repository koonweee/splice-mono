import { useInfiniteQuery } from '@tanstack/react-query'
import {
  getInvestmentControllerFindActivityForAccountQueryKey,
  investmentControllerFindActivityForAccount,
} from '../api/clients/spliceAPI'

const INVESTMENT_ACTIVITY_PAGE_SIZE = 10

export function useInvestmentActivity(accountId?: string, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: [
      ...getInvestmentControllerFindActivityForAccountQueryKey(accountId),
      'infinite',
    ],
    queryFn: ({ pageParam, signal }) =>
      investmentControllerFindActivityForAccount(
        accountId ?? '',
        {
          pageIndex: pageParam,
          pageSize: INVESTMENT_ACTIVITY_PAGE_SIZE,
        },
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const loadedThrough = (lastPage.pageIndex + 1) * lastPage.pageSize
      return loadedThrough < lastPage.total ? lastPage.pageIndex + 1 : undefined
    },
    enabled: enabled && !!accountId,
  })
  const activity = query.data?.pages.flatMap((page) => page.data) ?? []
  const pages = query.data?.pages ?? []
  const total = pages.length > 0 ? pages[pages.length - 1].total : 0

  return {
    ...query,
    activity,
    total,
    hasMore: query.hasNextPage,
    loadMore: query.fetchNextPage,
    isLoadingMore: query.isFetchingNextPage,
    isInitialError: query.isLoadingError,
    isLoadMoreError: query.isFetchNextPageError,
  }
}
