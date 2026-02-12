import { Flex, Group, Title } from '@mantine/core'
import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  getTransactionControllerFindAllQueryKey,
  transactionControllerFindAll,
} from '../../api/clients/spliceAPI'
import type { MRT_SortingState } from 'mantine-react-table'
import { TransactionsTable } from '@/components/TransactionsTable'

const PAGE_SIZE = 50

export const Route = createFileRoute('/_authed/transactions')({
  component: TransactionsPage,
})

function TransactionsPage() {
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'date', desc: true },
  ])

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      pageSize: String(PAGE_SIZE),
      convert: 'true',
    }
    if (sorting.length > 0) {
      params.sortBy = sorting[0].id
      params.sortOrder = sorting[0].desc ? 'DESC' : 'ASC'
    }
    return params
  }, [sorting])

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: [
      ...getTransactionControllerFindAllQueryKey(queryParams),
      'infinite',
    ],
    queryFn: ({ pageParam = 0 }) =>
      transactionControllerFindAll({
        ...queryParams,
        pageIndex: String(pageParam),
      }),
    initialPageParam: 0,
    getNextPageParam: (_lastPage, allPages) => {
      const lastPage = _lastPage
      const totalFetched = allPages.length * PAGE_SIZE
      return totalFetched < lastPage.total ? allPages.length : undefined
    },
  })

  const flatData = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  )
  const totalRows = data?.pages[0]?.total ?? 0

  const fetchMoreOnScroll = useCallback(() => {
    if (!isFetching && hasNextPage) {
      fetchNextPage()
    }
  }, [fetchNextPage, isFetching, hasNextPage])

  return (
    <Flex
      direction="column"
      style={{
        height: 'calc(100vh - 60px - 2 * var(--mantine-spacing-md))',
      }}
    >
      <Group justify="space-between" mb="md">
        <Title order={1}>Transactions</Title>
      </Group>
      <TransactionsTable
        data={flatData}
        totalRows={totalRows}
        isLoading={isLoading}
        isError={isError}
        isFetchingNextPage={isFetchingNextPage}
        enableVirtualization
        onScrollNearBottom={fetchMoreOnScroll}
        manualSorting
        sorting={sorting}
        onSortingChange={setSorting}
        mantinePaperProps={{
          style: { display: 'flex', flexDirection: 'column', flex: 1 },
        }}
        mantineTableContainerProps={{
          ref: tableContainerRef,
          style: { flex: 1, overflow: 'auto' },
        }}
      />
    </Flex>
  )
}
