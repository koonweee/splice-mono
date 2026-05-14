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
  Switch,
  Text,
} from '@mantine/core'
import { useClickOutside, useDisclosure, useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Filter, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getTransactionControllerFindAllQueryKey,
  transactionControllerFindAll,
  useAccountControllerFindAll,
  useCategoryControllerFindAll,
  useCategoryControllerFindFilterOptions,
  useTransactionControllerBulkUpdateCategories,
  useTransactionControllerGetSummary,
  useTransactionControllerRemoveManual,
  useTransactionControllerUndoBulkUpdateCategories,
} from '../../api/clients/spliceAPI'
import { formatPrimaryCategory } from '../../lib/format'
import { isAssignableCategoryOption } from '../../lib/category-options'
import { getFallbackCategoryColor } from '../../lib/category-colors'
import { isManualTransaction } from '../../lib/manual-transactions'
import {
  getViewportAwareComboboxProps,
  viewportAwareDropdownMaxHeight,
} from '../../lib/mobile-combobox'
import type {
  Category,
  Transaction,
  TransactionControllerFindAllParams,
  TransactionControllerGetSummaryParams,
} from '../../api/models'
import type { DatesRangeValue } from '@mantine/dates'
import type { MRT_SortingState } from 'mantine-react-table'
import type { CategorySelectOption } from '@/components/categories/CategorySelect'
import { DateRangeControl } from '@/components/DateRangeControl'
import { TransactionsTable } from '@/components/TransactionsTable'
import { CategorySelect } from '@/components/categories/CategorySelect'
import { TransactionBulkEditToolbar } from '@/components/transactions/TransactionBulkEditToolbar'
import { TransactionSummaryStrip } from '@/components/transactions/TransactionSummaryStrip'
import { TransactionsMobileList } from '@/components/transactions/TransactionsMobileList'
import { PageHeader } from '@/components/PageHeader'
import { ManualTransactionModal } from '@/components/transactions/ManualTransactionModal'

const PAGE_SIZE = 50
const CLEAR_CATEGORY_VALUE = '__clear_category__'
const UNCATEGORIZED_CATEGORY_VALUE = 'UNCATEGORIZED'

type TransactionsSearch = {
  accountId?: string
  startDate?: string
  endDate?: string
}

type TransactionFiltersPanelProps = {
  accountId: string | null
  accountOptions: Array<{ value: string; label: string }>
  amountSign: string
  categoryId: string | null
  categoryOptions: Array<CategorySelectOption>
  hasActiveFilters: boolean
  isMobile: boolean
  onAccountChange: (value: string | null) => void
  onAmountSignChange: (value: string) => void
  onCategoryChange: (value: string | null) => void
  onClearFilters: () => void
}

const amountSignOptions = [
  { label: 'All', value: 'all' },
  { label: 'Inflows', value: 'positive' },
  { label: 'Outflows', value: 'negative' },
]

const isValidDateString = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

function getCategorySelectOption(
  category: Pick<Category, 'id' | 'primary' | 'detailed' | 'color'>,
): CategorySelectOption {
  return {
    value: category.id,
    primary: category.primary,
    secondary: category.detailed,
    color: category.color,
  }
}

function sortCategoryOptions(
  left: CategorySelectOption,
  right: CategorySelectOption,
) {
  return (
    left.primary.localeCompare(right.primary) ||
    left.secondary.localeCompare(right.secondary)
  )
}

function TransactionsFilterPanel({
  accountId,
  accountOptions,
  amountSign,
  categoryId,
  categoryOptions,
  hasActiveFilters,
  isMobile,
  onAccountChange,
  onAmountSignChange,
  onCategoryChange,
  onClearFilters,
}: TransactionFiltersPanelProps) {
  const comboboxProps = isMobile
    ? getViewportAwareComboboxProps()
    : { withinPortal: false }
  const maxDropdownHeight = isMobile
    ? viewportAwareDropdownMaxHeight
    : undefined

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
          comboboxProps={comboboxProps}
          maxDropdownHeight={maxDropdownHeight}
        />
        <CategorySelect
          aria-label="Category"
          placeholder="Category"
          data={categoryOptions}
          value={categoryId}
          onChange={onCategoryChange}
          size="md"
          comboboxProps={comboboxProps}
          maxDropdownHeight={maxDropdownHeight}
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
  const [bulkModeEnabled, setBulkModeEnabled] = useState(false)
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<
    Set<string>
  >(() => new Set())
  const [bulkCategoryValue, setBulkCategoryValue] = useState<string | null>(
    null,
  )
  const [manualModalOpened, setManualModalOpened] = useState(false)
  const [editingManualTransaction, setEditingManualTransaction] =
    useState<Transaction | null>(null)

  // Filter state
  const [dateRange, setDateRange] = useState<DatesRangeValue>(() => [
    search.startDate ? dayjs(search.startDate).toDate() : null,
    search.endDate ? dayjs(search.endDate).toDate() : null,
  ])
  const [accountId, setAccountId] = useState<string | null>(
    search.accountId ?? null,
  )
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [amountSign, setAmountSign] = useState('all')

  // Account data for the select dropdown
  const { data: accounts } = useAccountControllerFindAll()
  const { data: categories } = useCategoryControllerFindFilterOptions()
  const { data: assignableCategories = [] } = useCategoryControllerFindAll()
  const bulkUpdateCategories = useTransactionControllerBulkUpdateCategories()
  const undoBulkUpdateCategories =
    useTransactionControllerUndoBulkUpdateCategories()

  const invalidateTransactions = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        typeof query.queryKey[0] === 'string' &&
        (query.queryKey[0].includes('transaction') ||
          query.queryKey[0].includes('category') ||
          query.queryKey[0].includes('analysis')),
    })
  }, [queryClient])
  const removeManualTransaction = useTransactionControllerRemoveManual({
    mutation: {
      onSuccess: () => {
        invalidateTransactions()
        notifications.show({
          title: 'Transaction deleted',
          message: 'The manual transaction was deleted.',
          color: 'green',
        })
      },
      onError: () => {
        notifications.show({
          title: 'Delete failed',
          message: 'The manual transaction was not deleted.',
          color: 'red',
        })
      },
    },
  })

  const accountOptions = useMemo(
    () =>
      (accounts ?? []).map((account) => ({
        value: account.id,
        label: `${account.customName ?? account.name ?? 'Account'}${account.mask ? ` ••${account.mask}` : ''}`,
      })),
    [accounts],
  )

  const categoryOptions = useMemo(
    () => [
      {
        value: UNCATEGORIZED_CATEGORY_VALUE,
        primary: formatPrimaryCategory(UNCATEGORIZED_CATEGORY_VALUE),
        secondary: 'No assigned category',
        color: getFallbackCategoryColor(UNCATEGORIZED_CATEGORY_VALUE),
      },
      ...(categories ?? [])
        .filter(isAssignableCategoryOption)
        .map(getCategorySelectOption)
        .sort(sortCategoryOptions),
    ],
    [categories],
  )

  const assignableCategoryOptions = useMemo(
    () => [
      {
        value: CLEAR_CATEGORY_VALUE,
        primary: 'Clear category',
        secondary: 'Remove category from selected transactions',
        color: getFallbackCategoryColor(UNCATEGORIZED_CATEGORY_VALUE),
      },
      ...assignableCategories
        .filter(isAssignableCategoryOption)
        .map(getCategorySelectOption)
        .sort(sortCategoryOptions),
    ],
    [assignableCategories],
  )

  const queryParams = useMemo(() => {
    const params: TransactionControllerFindAllParams & {
      categoryId?: string
    } = {
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
    if (categoryId) {
      params.categoryId = categoryId
    }
    if (amountSign === 'positive' || amountSign === 'negative') {
      params.amountSign = amountSign
    }
    return params
  }, [sorting, dateRange, accountId, categoryId, amountSign])

  const summaryParams = useMemo(() => {
    const params: TransactionControllerGetSummaryParams & {
      categoryId?: string
    } = {
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
    if (categoryId) {
      params.categoryId = categoryId
    }
    if (amountSign === 'positive' || amountSign === 'negative') {
      params.amountSign = amountSign
    }
    return params
  }, [accountId, amountSign, categoryId, dateRange])

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
  const loadedTransactionIds = useMemo(
    () =>
      flatData
        .filter((transaction) => !isManualTransaction(transaction))
        .map((transaction) => transaction.id),
    [flatData],
  )

  useEffect(() => {
    setSelectedTransactionIds(new Set())
  }, [queryParams])

  useEffect(() => {
    if (!bulkModeEnabled) {
      setSelectedTransactionIds(new Set())
      setBulkCategoryValue(null)
    }
  }, [bulkModeEnabled])

  const fetchMoreOnScroll = useCallback(() => {
    if (!isFetching && hasNextPage) {
      fetchNextPage()
    }
  }, [fetchNextPage, isFetching, hasNextPage])

  const hasActiveFilters =
    dateRange[0] !== null ||
    accountId !== null ||
    categoryId !== null ||
    amountSign !== 'all'

  const clearFilters = () => {
    setDateRange([null, null])
    setAccountId(null)
    setCategoryId(null)
    setAmountSign('all')
  }

  const openCreateManualTransaction = () => {
    setEditingManualTransaction(null)
    setManualModalOpened(true)
  }

  const openEditManualTransaction = (transaction: Transaction) => {
    setEditingManualTransaction(transaction)
    setManualModalOpened(true)
  }

  const closeManualTransactionModal = () => {
    setManualModalOpened(false)
    setEditingManualTransaction(null)
  }

  const deleteManualTransaction = (transaction: Transaction) => {
    const confirmed = window.confirm(
      `Delete "${transaction.merchantName ?? 'this transaction'}"?`,
    )

    if (!confirmed) {
      return
    }

    removeManualTransaction.mutate({ id: transaction.id })
  }

  const selectedLoadedCount = loadedTransactionIds.filter((id) =>
    selectedTransactionIds.has(id),
  ).length
  const selectedCount = selectedLoadedCount
  const allLoadedSelected =
    loadedTransactionIds.length > 0 &&
    selectedLoadedCount === loadedTransactionIds.length
  const someLoadedSelected = selectedLoadedCount > 0

  const toggleTransactionSelection = useCallback((transactionId: string) => {
    setSelectedTransactionIds((current) => {
      const next = new Set(current)
      if (next.has(transactionId)) {
        next.delete(transactionId)
      } else {
        next.add(transactionId)
      }

      return next
    })
  }, [])

  const toggleLoadedSelection = useCallback(() => {
    setSelectedTransactionIds((current) => {
      const next = new Set(current)

      if (loadedTransactionIds.every((id) => next.has(id))) {
        loadedTransactionIds.forEach((id) => next.delete(id))
      } else {
        loadedTransactionIds.forEach((id) => next.add(id))
      }

      return next
    })
  }, [loadedTransactionIds])

  const saveBulkCategoryUpdate = () => {
    const selectedLoadedTransactionIds = loadedTransactionIds.filter((id) =>
      selectedTransactionIds.has(id),
    )

    if (
      bulkCategoryValue === null ||
      selectedLoadedTransactionIds.length === 0
    ) {
      return
    }

    bulkUpdateCategories.mutate(
      {
        data: {
          transactionIds: selectedLoadedTransactionIds,
          categoryId:
            bulkCategoryValue === CLEAR_CATEGORY_VALUE
              ? null
              : bulkCategoryValue,
        },
      },
      {
        onSuccess: (result) => {
          invalidateTransactions()
          setSelectedTransactionIds(new Set())
          notifications.show({
            title: 'Categories updated',
            message: (
              <Group gap="xs" wrap="nowrap">
                <Text size="sm">
                  Updated {result.count} transaction
                  {result.count === 1 ? '' : 's'}.
                </Text>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() =>
                    undoBulkUpdateCategories.mutate(
                      { data: { undo: result.undo } },
                      {
                        onSuccess: invalidateTransactions,
                        onError: () => {
                          notifications.show({
                            title: 'Undo failed',
                            message: 'Category changes were not restored.',
                            color: 'red',
                          })
                        },
                      },
                    )
                  }
                >
                  Undo
                </Button>
              </Group>
            ),
            color: 'green',
          })
        },
        onError: () => {
          notifications.show({
            title: 'Category update failed',
            message: 'No transactions were updated.',
            color: 'red',
          })
        },
      },
    )
  }

  const hiddenActiveFilterCount = [
    accountId,
    categoryId,
    amountSign !== 'all' ? amountSign : null,
  ].filter(Boolean).length

  const filterButtonLabel =
    hiddenActiveFilterCount > 0
      ? `Open transaction filters, ${hiddenActiveFilterCount} active`
      : 'Open transaction filters'

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
      categoryId={categoryId}
      categoryOptions={categoryOptions}
      hasActiveFilters={hasActiveFilters}
      isMobile={Boolean(isMobile)}
      onAccountChange={setAccountId}
      onAmountSignChange={setAmountSign}
      onCategoryChange={setCategoryId}
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
      <PageHeader
        title="Transactions"
        mb="md"
        wrap="nowrap"
        actions={
          <Group gap="sm" wrap="nowrap">
            <Button
              leftSection={<Plus size={16} />}
              onClick={openCreateManualTransaction}
              size={isMobile ? 'sm' : 'md'}
            >
              Add transaction
            </Button>
            <Switch
              checked={bulkModeEnabled}
              label="Bulk edit"
              onChange={(event) =>
                setBulkModeEnabled(event.currentTarget.checked)
              }
            />
          </Group>
        }
      />
      <ManualTransactionModal
        accounts={accounts ?? []}
        categories={assignableCategories}
        defaultAccountId={accountId}
        opened={manualModalOpened}
        transaction={editingManualTransaction}
        onClose={closeManualTransactionModal}
        onSaved={invalidateTransactions}
      />

      <Group
        mb={isMobile ? 'xs' : 'md'}
        gap="xs"
        wrap={isMobile ? 'wrap' : 'nowrap'}
        align="center"
      >
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
            size="min(430px, 80dvh)"
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
        {!isMobile &&
          (bulkModeEnabled ? (
            <TransactionBulkEditToolbar
              categoryOptions={assignableCategoryOptions}
              isSaving={bulkUpdateCategories.isPending}
              loadedCount={loadedTransactionIds.length}
              selectedCount={selectedCount}
              selectLoadedChecked={allLoadedSelected}
              selectLoadedIndeterminate={
                someLoadedSelected && !allLoadedSelected
              }
              value={bulkCategoryValue}
              onChange={setBulkCategoryValue}
              onSave={saveBulkCategoryUpdate}
              onToggleLoaded={toggleLoadedSelection}
              showSelectLoaded={false}
              variant="summary"
            />
          ) : (
            transactionSummaryStrip
          ))}
      </Group>

      {isMobile && (
        <Box mb="md">
          {bulkModeEnabled ? (
            <TransactionBulkEditToolbar
              categoryOptions={assignableCategoryOptions}
              isSaving={bulkUpdateCategories.isPending}
              loadedCount={loadedTransactionIds.length}
              selectedCount={selectedCount}
              selectLoadedChecked={allLoadedSelected}
              selectLoadedIndeterminate={
                someLoadedSelected && !allLoadedSelected
              }
              value={bulkCategoryValue}
              onChange={setBulkCategoryValue}
              onSave={saveBulkCategoryUpdate}
              onToggleLoaded={toggleLoadedSelection}
              showSelectLoaded
              variant="inline"
            />
          ) : (
            transactionSummaryStrip
          )}
        </Box>
      )}

      {isMobile ? (
        <TransactionsMobileList
          data={flatData}
          totalRows={totalRows}
          isLoading={isLoading}
          isError={isError}
          isFetchingNextPage={isFetchingNextPage}
          onScrollNearBottom={fetchMoreOnScroll}
          bulkModeEnabled={bulkModeEnabled}
          selectedTransactionIds={selectedTransactionIds}
          onToggleTransactionSelection={toggleTransactionSelection}
          onEditManualTransaction={openEditManualTransaction}
          onDeleteManualTransaction={deleteManualTransaction}
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
          bulkModeEnabled={bulkModeEnabled}
          selectedTransactionIds={selectedTransactionIds}
          onToggleTransactionSelection={toggleTransactionSelection}
          onToggleLoadedSelection={toggleLoadedSelection}
          onEditManualTransaction={openEditManualTransaction}
          onDeleteManualTransaction={deleteManualTransaction}
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
