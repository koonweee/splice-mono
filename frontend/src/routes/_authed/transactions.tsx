import { Badge, Flex, Group, Title } from '@mantine/core'
import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  getTransactionControllerFindAllQueryKey,
  transactionControllerFindAll,
} from '../../api/clients/spliceAPI'
import type { MRT_ColumnDef, MRT_SortingState } from 'mantine-react-table'
import type { Transaction } from '../../api/models'
import { formatCategoryName, formatMoneyWithSign } from '@/lib/format'

const PAGE_SIZE = 50

export const Route = createFileRoute('/_authed/transactions')({
  component: TransactionsPage,
})

const columns: Array<MRT_ColumnDef<Transaction>> = [
  {
    accessorKey: 'date',
    header: 'Date',
    Cell: ({ cell }) => dayjs(cell.getValue<string>()).format('MMM D, YYYY'),
  },
  {
    accessorKey: 'merchantName',
    header: 'Merchant',
    Cell: ({ cell }) => cell.getValue<string | null>() ?? '--',
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    enableSorting: false,
    Cell: ({ row }) => formatMoneyWithSign({ value: row.original.amount }),
  },
  {
    accessorKey: 'accountName',
    header: 'Account',
    enableSorting: false,
    Cell: ({ cell }) => cell.getValue<string | null>() ?? '--',
  },
  {
    id: 'category',
    header: 'Category',
    enableSorting: false,
    accessorFn: (row) =>
      row.category ? formatCategoryName(row.category) : '--',
  },
  {
    accessorKey: 'pending',
    header: 'Status',
    Cell: ({ cell }) =>
      cell.getValue<boolean>() ? (
        <Badge color="yellow" variant="light">
          Pending
        </Badge>
      ) : (
        <Badge color="green" variant="light">
          Posted
        </Badge>
      ),
  },
]

function TransactionsPage() {
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'date', desc: true },
  ])

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      pageSize: String(PAGE_SIZE),
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

  const fetchMoreOnScroll = useCallback(
    (containerRef: HTMLDivElement | null) => {
      if (!containerRef) return
      const { scrollHeight, scrollTop, clientHeight } = containerRef
      if (
        scrollHeight - scrollTop - clientHeight < 400 &&
        !isFetching &&
        hasNextPage
      ) {
        fetchNextPage()
      }
    },
    [fetchNextPage, isFetching, hasNextPage],
  )

  const table = useMantineReactTable({
    columns,
    data: flatData,
    rowCount: totalRows,
    enablePagination: false,
    manualSorting: true,
    onSortingChange: setSorting,
    enableRowVirtualization: true,
    state: {
      sorting,
      isLoading,
      showProgressBars: isFetchingNextPage,
      showAlertBanner: isError,
    },
    enableGlobalFilter: false,
    enableColumnFilters: false,
    enableColumnActions: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableHiding: false,
    enableTopToolbar: false,
    enableBottomToolbar: false,
    enableStickyHeader: true,
    initialState: { density: 'xs' },
    mantineTableContainerProps: {
      ref: tableContainerRef,
      style: { flex: 1, overflow: 'auto' },
      onScroll: (e) => fetchMoreOnScroll(e.currentTarget),
    },
    mantinePaperProps: {
      style: { display: 'flex', flexDirection: 'column', flex: 1 },
    },
    mantineToolbarAlertBannerProps: isError
      ? { color: 'red', children: 'Error loading transactions' }
      : undefined,
  })

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
      <MantineReactTable table={table} />
    </Flex>
  )
}
