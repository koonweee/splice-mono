import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Flex,
  FocusTrap,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useClickOutside, useDisclosure, useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Filter } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  getTransactionControllerFindAllQueryKey,
  transactionControllerFindAll,
  useAccountControllerFindAll,
  useCategoryControllerFindFilterOptions,
  useTransactionControllerBulkReviewCategories,
  useTransactionControllerGetSummary,
  useTransactionControllerUndoBulkReviewCategories,
} from '../../api/clients/spliceAPI'
import { formatPrimaryCategory } from '../../lib/format'
import type {
  BulkTransactionCategoryReviewDto,
  Category,
  TransactionControllerFindAllParams,
  TransactionControllerGetSummaryParams,
} from '../../api/models'
import type { DatesRangeValue } from '@mantine/dates'
import type { MRT_SortingState } from 'mantine-react-table'
import { DateRangeControl } from '@/components/DateRangeControl'
import { TransactionsTable } from '@/components/TransactionsTable'
import { TransactionSummaryStrip } from '@/components/transactions/TransactionSummaryStrip'
import { TransactionsMobileList } from '@/components/transactions/TransactionsMobileList'

const PAGE_SIZE = 50

type CategoryReviewFilter = 'all' | 'needs_review' | 'reviewed'

type TransactionsSearch = {
  accountId?: string
  startDate?: string
  endDate?: string
}

type TransactionFiltersPanelProps = {
  accountId: string | null
  accountOptions: Array<{ value: string; label: string }>
  amountSign: string
  categoryOptions: Array<{ value: string; label: string }>
  categoryPrimary: string | null
  categoryReviewStatus: CategoryReviewFilter
  hasActiveFilters: boolean
  isMobile: boolean
  onAccountChange: (value: string | null) => void
  onAmountSignChange: (value: string) => void
  onCategoryChange: (value: string | null) => void
  onCategoryReviewStatusChange: (value: CategoryReviewFilter) => void
  onClearFilters: () => void
}

const amountSignOptions = [
  { label: 'All', value: 'all' },
  { label: 'Inflows', value: 'positive' },
  { label: 'Outflows', value: 'negative' },
]

const categoryReviewOptions = [
  { label: 'All', value: 'all' },
  { label: 'Needs review', value: 'needs_review' },
  { label: 'Reviewed', value: 'reviewed' },
]

const isValidDateString = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

function getPrimaryCategoryLabel(
  category: Pick<Category, 'primary' | 'source'>,
) {
  return category.source === 'user'
    ? category.primary
    : formatPrimaryCategory(category.primary)
}

function TransactionsFilterPanel({
  accountId,
  accountOptions,
  amountSign,
  categoryOptions,
  categoryPrimary,
  categoryReviewStatus,
  hasActiveFilters,
  isMobile,
  onAccountChange,
  onAmountSignChange,
  onCategoryChange,
  onCategoryReviewStatusChange,
  onClearFilters,
}: TransactionFiltersPanelProps) {
  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text fw={600} size="sm">
          Filters
        </Text>
        <Select
          placeholder="Account"
          data={accountOptions}
          value={accountId}
          onChange={onAccountChange}
          clearable
          searchable
          size="md"
          comboboxProps={{ withinPortal: false }}
        />
        <Select
          placeholder="Category"
          data={categoryOptions}
          value={categoryPrimary}
          onChange={onCategoryChange}
          clearable
          searchable
          size="md"
          comboboxProps={{ withinPortal: false }}
        />
      </Stack>

      <Divider />

      <Stack gap="xs">
        <Text fw={600} size="sm">
          Flow
        </Text>
        <SegmentedControl
          value={amountSign}
          onChange={onAmountSignChange}
          size={isMobile ? 'md' : 'sm'}
          fullWidth
          data={amountSignOptions}
        />
      </Stack>

      <Stack gap="xs">
        <Text fw={600} size="sm">
          Review
        </Text>
        <SegmentedControl
          value={categoryReviewStatus}
          onChange={(value) =>
            onCategoryReviewStatusChange(value as CategoryReviewFilter)
          }
          size={isMobile ? 'md' : 'sm'}
          fullWidth
          data={categoryReviewOptions}
        />
      </Stack>

      {hasActiveFilters ? (
        <>
          <Divider />
          <Button
            variant="subtle"
            size={isMobile ? 'md' : 'xs'}
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
        </>
      ) : null}
    </Stack>
  )
}

export const Route = createFileRoute('/_authed/transactions')({
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => ({
    accountId:
      typeof search.accountId === 'string' ? search.accountId : undefined,
    startDate: isValidDateString(search.startDate)
      ? search.startDate
      : undefined,
    endDate: isValidDateString(search.endDate) ? search.endDate : undefined,
  }),
  component: TransactionsPage,
})

function TransactionsPage() {
  const search = Route.useSearch()
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [filtersOpened, { close: closeFilters, toggle: toggleFilters }] =
    useDisclosure(false)
  const desktopFilterRef = useClickOutside<HTMLDivElement>(() => {
    if (!isMobile && filtersOpened) {
      closeFilters()
    }
  })
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'activityDate', desc: true },
  ])

  // Filter state
  const [dateRange, setDateRange] = useState<DatesRangeValue>(() => [
    search.startDate ? dayjs(search.startDate).toDate() : null,
    search.endDate ? dayjs(search.endDate).toDate() : null,
  ])
  const [accountId, setAccountId] = useState<string | null>(
    search.accountId ?? null,
  )
  const [categoryPrimary, setCategoryPrimary] = useState<string | null>(null)
  const [amountSign, setAmountSign] = useState('all')
  const [categoryReviewStatus, setCategoryReviewStatus] =
    useState<CategoryReviewFilter>('all')

  // Account data for the select dropdown
  const { data: accounts } = useAccountControllerFindAll()
  const { data: categories } = useCategoryControllerFindFilterOptions()
  const bulkReviewCategories = useTransactionControllerBulkReviewCategories()
  const undoBulkReviewCategories =
    useTransactionControllerUndoBulkReviewCategories()

  const invalidateTransactions = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        typeof query.queryKey[0] === 'string' &&
        query.queryKey[0].includes('transaction'),
    })
  }, [queryClient])

  const accountOptions = useMemo(
    () =>
      (accounts ?? []).map((account) => ({
        value: account.id,
        label: `${account.customName ?? account.name ?? 'Account'}${account.mask ? ` ••${account.mask}` : ''}`,
      })),
    [accounts],
  )

  const categoryOptions = useMemo(() => {
    const options = new Map<string, string>()
    options.set('UNCATEGORIZED', formatPrimaryCategory('UNCATEGORIZED'))
    ;(categories ?? []).forEach((category) => {
      if (!options.has(category.primary)) {
        options.set(category.primary, getPrimaryCategoryLabel(category))
      }
    })

    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }, [categories])

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
    if (categoryReviewStatus !== 'all') {
      params.categoryReviewStatus = categoryReviewStatus
    }
    return params
  }, [
    sorting,
    dateRange,
    accountId,
    categoryPrimary,
    amountSign,
    categoryReviewStatus,
  ])

  const summaryParams = useMemo(() => {
    const params: TransactionControllerGetSummaryParams = {
      convert: true,
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
    if (categoryReviewStatus !== 'all') {
      params.categoryReviewStatus = categoryReviewStatus
    }
    return params
  }, [accountId, amountSign, categoryPrimary, categoryReviewStatus, dateRange])

  const bulkReviewFilters = useMemo(() => {
    const filters: NonNullable<BulkTransactionCategoryReviewDto['filters']> = {
      categoryReviewStatus: 'needs_review',
    }
    const [start, end] = dateRange
    if (start && end) {
      filters.startDate = dayjs(start).format('YYYY-MM-DD')
      filters.endDate = dayjs(end).format('YYYY-MM-DD')
    }
    if (accountId) {
      filters.accountId = accountId
    }
    if (categoryPrimary) {
      filters.categoryPrimary = categoryPrimary
    }
    if (amountSign === 'positive' || amountSign === 'negative') {
      filters.amountSign = amountSign
    }
    return filters
  }, [accountId, amountSign, categoryPrimary, dateRange])

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
  const {
    data: summary,
    isError: isSummaryError,
    isLoading: isSummaryLoading,
  } = useTransactionControllerGetSummary(summaryParams)

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

  const hasActiveFilters =
    dateRange[0] !== null ||
    accountId !== null ||
    categoryPrimary !== null ||
    amountSign !== 'all' ||
    categoryReviewStatus !== 'all'

  const clearFilters = () => {
    setDateRange([null, null])
    setAccountId(null)
    setCategoryPrimary(null)
    setAmountSign('all')
    setCategoryReviewStatus('all')
  }

  const hiddenActiveFilterCount = [
    accountId,
    categoryPrimary,
    amountSign !== 'all' ? amountSign : null,
    categoryReviewStatus !== 'all' ? categoryReviewStatus : null,
  ].filter(Boolean).length

  const filterButtonLabel =
    hiddenActiveFilterCount > 0
      ? `Open transaction filters, ${hiddenActiveFilterCount} active`
      : 'Open transaction filters'

  const markFilteredAsReviewed = () => {
    bulkReviewCategories.mutate(
      {
        data: { filters: bulkReviewFilters },
      },
      {
        onSuccess: (result) => {
          invalidateTransactions()
          notifications.show({
            title: 'Categories reviewed',
            message: (
              <Group gap="xs" wrap="nowrap">
                <Text size="sm">
                  Marked {result.count} transactions as reviewed.
                </Text>
                {result.transactionIds.length > 0 && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() =>
                      undoBulkReviewCategories.mutate(
                        {
                          data: { transactionIds: result.transactionIds },
                        },
                        { onSuccess: invalidateTransactions },
                      )
                    }
                  >
                    Undo
                  </Button>
                )}
              </Group>
            ),
            color: 'green',
          })
        },
      },
    )
  }

  const transactionSummaryStrip = (
    <TransactionSummaryStrip
      summary={summary}
      isLoading={isSummaryLoading}
      isError={isSummaryError}
    />
  )

  const filterPanel = (
    <TransactionsFilterPanel
      accountId={accountId}
      accountOptions={accountOptions}
      amountSign={amountSign}
      categoryOptions={categoryOptions}
      categoryPrimary={categoryPrimary}
      categoryReviewStatus={categoryReviewStatus}
      hasActiveFilters={hasActiveFilters}
      isMobile={Boolean(isMobile)}
      onAccountChange={setAccountId}
      onAmountSignChange={setAmountSign}
      onCategoryChange={setCategoryPrimary}
      onCategoryReviewStatusChange={setCategoryReviewStatus}
      onClearFilters={clearFilters}
    />
  )

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

      <Group mb={isMobile ? 'xs' : 'md'} gap="xs" wrap="wrap" align="center">
        {isMobile ? (
          <Group flex={1} gap="xs" miw={0} wrap="nowrap">
            <DateRangeControl onChange={setDateRange} value={dateRange} />
            <Box pos="relative">
              <ActionIcon
                aria-label={filterButtonLabel}
                variant={hiddenActiveFilterCount > 0 ? 'light' : 'default'}
                size={48}
                onClick={toggleFilters}
              >
                <Filter size={20} />
              </ActionIcon>
              {hiddenActiveFilterCount > 0 && (
                <Badge circle size="xs" pos="absolute" top={-6} right={-6}>
                  {hiddenActiveFilterCount}
                </Badge>
              )}
            </Box>
          </Group>
        ) : (
          <DateRangeControl onChange={setDateRange} value={dateRange} />
        )}

        {isMobile ? (
          <Drawer
            opened={filtersOpened}
            onClose={closeFilters}
            title="Filters"
            position="bottom"
            size="auto"
            padding="md"
          >
            {filterPanel}
          </Drawer>
        ) : (
          <Box pos="relative" ref={desktopFilterRef}>
            <ActionIcon
              aria-label={filterButtonLabel}
              variant={hiddenActiveFilterCount > 0 ? 'light' : 'default'}
              size={42}
              onClick={toggleFilters}
            >
              <Filter size={18} />
            </ActionIcon>
            {hiddenActiveFilterCount > 0 && (
              <Badge circle size="xs" pos="absolute" top={-6} right={-6}>
                {hiddenActiveFilterCount}
              </Badge>
            )}
            {filtersOpened && (
              <FocusTrap active>
                <Box
                  aria-label="Transaction filters"
                  className="splice-floating-panel"
                  role="dialog"
                  p="md"
                  pos="absolute"
                  tabIndex={-1}
                  top="calc(100% + 8px)"
                  right={0}
                  w={360}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      closeFilters()
                    }
                  }}
                >
                  <FocusTrap.InitialFocus />
                  {filterPanel}
                </Box>
              </FocusTrap>
            )}
          </Box>
        )}
        {!isMobile && transactionSummaryStrip}
        {categoryReviewStatus === 'needs_review' && totalRows > 0 && (
          <Button
            variant="light"
            size="md"
            mih={isMobile ? 48 : undefined}
            loading={bulkReviewCategories.isPending}
            onClick={markFilteredAsReviewed}
          >
            Mark {totalRows} as reviewed
          </Button>
        )}
      </Group>

      {isMobile && <Box mb="md">{transactionSummaryStrip}</Box>}

      {isMobile ? (
        <TransactionsMobileList
          data={flatData}
          totalRows={totalRows}
          isLoading={isLoading}
          isError={isError}
          isFetchingNextPage={isFetchingNextPage}
          onScrollNearBottom={fetchMoreOnScroll}
        />
      ) : (
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
      )}
    </Flex>
  )
}
