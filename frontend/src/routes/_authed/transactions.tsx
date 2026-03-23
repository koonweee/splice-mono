import {
  Button,
  Flex,
  Group,
  SegmentedControl,
  Select,
  Title,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  getTransactionControllerFindAllQueryKey,
  transactionControllerFindAll,
  useAccountControllerFindAll,
} from '../../api/clients/spliceAPI'
import { CATEGORY_COLORS } from '../../lib/constants'
import { formatPrimaryCategory } from '../../lib/format'
import type { TransactionControllerFindAllParams } from '../../api/models'
import type { DatesRangeValue } from '@mantine/dates'
import type { MRT_SortingState } from 'mantine-react-table'
import { TransactionsTable } from '@/components/TransactionsTable'

const PAGE_SIZE = 50

type TransactionsSearch = {
  accountId?: string
  startDate?: string
  endDate?: string
}

const isValidDateString = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

const CATEGORY_OPTIONS = Object.keys(CATEGORY_COLORS).map((key) => ({
  value: key,
  label: formatPrimaryCategory(key),
}))

export const Route = createFileRoute('/_authed/transactions')({
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => ({
    accountId: typeof search.accountId === 'string' ? search.accountId : undefined,
    startDate: isValidDateString(search.startDate) ? search.startDate : undefined,
    endDate: isValidDateString(search.endDate) ? search.endDate : undefined,
  }),
  component: TransactionsPage,
})

function TransactionsPage() {
  const search = Route.useSearch()
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'date', desc: true },
  ])

  // Filter state
  const [dateRange, setDateRange] = useState<DatesRangeValue>(() => [
    search.startDate ? dayjs(search.startDate).toDate() : null,
    search.endDate ? dayjs(search.endDate).toDate() : null,
  ])
  const [accountId, setAccountId] = useState<string | null>(search.accountId ?? null)
  const [categoryPrimary, setCategoryPrimary] = useState<string | null>(null)
  const [amountSign, setAmountSign] = useState('all')

  // Account data for the select dropdown
  const { data: accounts } = useAccountControllerFindAll()

  const accountOptions = useMemo(
    () =>
      (accounts ?? []).map((account) => ({
        value: account.id,
        label: `${account.customName ?? account.name ?? 'Account'}${account.mask ? ` ••${account.mask}` : ''}`,
      })),
    [accounts],
  )

  const queryParams = useMemo(() => {
    const params: TransactionControllerFindAllParams = {
      pageSize: String(PAGE_SIZE),
      convert: true,
    }
    if (sorting.length > 0) {
      params.sortBy = sorting[0].id
      params.sortOrder = sorting[0].desc ? 'DESC' : 'ASC'
    }
    const [start, end] = dateRange
    if (start && end) {
      params.startDate = dayjs(start).format('YYYY-MM-DD')
      params.endDate = dayjs(end).format('YYYY-MM-DD')
    }
    if (accountId) {
      params.accountId = accountId
    }
    if (categoryPrimary) {
      params.categoryPrimary = categoryPrimary
    }
    if (amountSign === 'positive' || amountSign === 'negative') {
      params.amountSign = amountSign
    }
    return params
  }, [sorting, dateRange, accountId, categoryPrimary, amountSign])

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

  const handleDateRangeChange = (range: DatesRangeValue) => {
    setDateRange(range)
  }

  const hasActiveFilters =
    dateRange[0] !== null ||
    accountId !== null ||
    categoryPrimary !== null ||
    amountSign !== 'all'

  const clearFilters = () => {
    setDateRange([null, null])
    setAccountId(null)
    setCategoryPrimary(null)
    setAmountSign('all')
  }

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

      <Group mb="md" gap="xs" wrap="wrap">
        <Button
          variant="light"
          size="xs"
          onClick={() => {
            const start = dayjs().startOf('month').toDate()
            const end = dayjs().toDate()
            setDateRange([start, end])
          }}
        >
          This Month
        </Button>
        <Button
          variant="light"
          size="xs"
          onClick={() => {
            const start = dayjs()
              .subtract(1, 'month')
              .startOf('month')
              .toDate()
            const end = dayjs().subtract(1, 'month').endOf('month').toDate()
            setDateRange([start, end])
          }}
        >
          Last Month
        </Button>
        <DatePickerInput
          type="range"
          placeholder="Date range"
          value={dateRange}
          onChange={handleDateRangeChange}
          maxDate={new Date()}
          size="xs"
          clearable
        />
        <Select
          placeholder="Account"
          data={accountOptions}
          value={accountId}
          onChange={setAccountId}
          clearable
          searchable
          size="xs"
          w={200}
        />
        <Select
          placeholder="Category"
          data={CATEGORY_OPTIONS}
          value={categoryPrimary}
          onChange={setCategoryPrimary}
          clearable
          searchable
          size="xs"
          w={180}
        />
        <SegmentedControl
          value={amountSign}
          onChange={setAmountSign}
          size="xs"
          data={[
            { label: 'All', value: 'all' },
            { label: 'Inflows', value: 'positive' },
            { label: 'Outflows', value: 'negative' },
          ]}
        />
        {hasActiveFilters && (
          <Button variant="subtle" size="xs" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
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
