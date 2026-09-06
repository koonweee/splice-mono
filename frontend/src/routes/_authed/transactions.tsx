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
  Stack,
  Switch,
  Text,
} from '@mantine/core'
import { useClickOutside, useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Filter, Plus } from 'lucide-react'
import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invalidateMutationFamilies } from '../../lib/query-invalidation'
import { DeferredFeature } from '../../components/DeferredFeature'
import {
  useAccountControllerFindAll,
  useCategoryControllerFindAll,
  useCategoryControllerFindFilterOptions,
  useTransactionControllerBulkUpdateCategories,
  useTransactionControllerRemoveManual,
  useTransactionControllerUndoBulkUpdateCategories,
} from '../../api/clients/spliceAPI'
import { formatPrimaryCategory } from '../../lib/format'
import { formatDateRangeLabel } from '../../lib/date-range'
import { isAssignableCategoryOption } from '../../lib/category-options'
import { getFallbackCategoryColor } from '../../lib/category-colors'
import { isManualTransaction } from '../../lib/manual-transactions'
import { getApiErrorMessage } from '../../lib/api-errors'
import { useCompactLayout } from '../../lib/responsive'
import { awaitSsrData } from '../../lib/queries/loader'
import {
  getViewportAwareOverlayComboboxProps,
  viewportAwareDropdownMaxHeight,
} from '../../lib/mobile-combobox'
import {
  PAGE_SIZE,
  accountsQueryOptions,
  categoriesQueryOptions,
  categoryFiltersQueryOptions,
  initialTransactionParams,
  transactionsQueryOptions,
} from '../../lib/queries/primary'
import type {
  Category,
  Transaction,
  TransactionControllerFindAllParams,
} from '../../api/models'
import type { DatesRangeValue } from '@mantine/dates'
import type { MRT_SortingState } from 'mantine-react-table'
import type { CategorySelectOption } from '@/components/categories/CategorySelect'
import {
  DateRangeControl,
  DateRangeFields,
} from '@/components/DateRangeControl'
import { TransactionsTable } from '@/components/TransactionsTable'
import { CategorySelect } from '@/components/categories/CategorySelect'
import { TransactionBulkEditToolbar } from '@/components/transactions/TransactionBulkEditToolbar'
import { TransactionsMobileList } from '@/components/transactions/TransactionsMobileList'
import { PageHeader } from '@/components/PageHeader'
import { AccountSelect } from '@/components/accounts/AccountSelect'
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { DataState } from '@/components/DataState'

const ManualTransactionModal = lazy(() =>
  import('@/components/transactions/ManualTransactionModal').then((module) => ({
    default: module.ManualTransactionModal,
  })),
)

const CLEAR_CATEGORY_VALUE = '__clear_category__'
const UNCATEGORIZED_CATEGORY_VALUE = 'UNCATEGORIZED'

type TransactionsSearch = {
  accountId?: string
  categoryId?: string
  startDate?: string
  endDate?: string
}

type TransactionFiltersPanelProps = {
  accountId: string | null
  accountOptions: Array<{ value: string; label: string }>
  amountSign: string
  categoryId: string | null
  categoryOptions: Array<CategorySelectOption>
  dateRange: DatesRangeValue
  hasActiveFilters: boolean
  isMobile: boolean
  onAccountChange: (value: string | null) => void
  onAmountSignChange: (value: string) => void
  onCategoryChange: (value: string | null) => void
  onDateRangeChange: (value: DatesRangeValue) => void
  onClearFilters: () => void
  onDone: () => void
}

const amountSignOptions = [
  { label: 'All', value: 'all' },
  { label: 'Inflows', value: 'positive' },
  { label: 'Outflows', value: 'negative' },
]

const isValidDateString = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const date = new Date(`${value}T00:00:00Z`)
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

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
  dateRange,
  hasActiveFilters,
  isMobile,
  onAccountChange,
  onAmountSignChange,
  onCategoryChange,
  onDateRangeChange,
  onClearFilters,
  onDone,
}: TransactionFiltersPanelProps) {
  const comboboxProps = isMobile
    ? getViewportAwareOverlayComboboxProps()
    : { withinPortal: false }
  const maxDropdownHeight = isMobile
    ? viewportAwareDropdownMaxHeight
    : undefined

  return (
    <Stack gap="md">
      {isMobile && (
        <>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                Date range
              </Text>
              {dateRange.some(Boolean) && (
                <Button
                  onClick={() => onDateRangeChange([null, null])}
                  size="compact-sm"
                  variant="subtle"
                >
                  Clear dates
                </Button>
              )}
            </Group>
            <DateRangeFields onChange={onDateRangeChange} value={dateRange} />
          </Stack>
          <Divider />
        </>
      )}
      <Stack gap="xs">
        <AccountSelect
          label="Account"
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
          label="Category"
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

      {hasActiveFilters || isMobile ? (
        <>
          <Divider />
          <Group justify="space-between" grow={isMobile}>
            {hasActiveFilters && (
              <Button variant="default" size="md" onClick={onClearFilters}>
                Clear filters
              </Button>
            )}
            {isMobile && <Button onClick={onDone}>Done</Button>}
          </Group>
        </>
      ) : null}
    </Stack>
  )
}

export const Route = createFileRoute('/_authed/transactions')({
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => ({
    accountId:
      typeof search.accountId === 'string' ? search.accountId : undefined,
    categoryId:
      typeof search.categoryId === 'string' ? search.categoryId : undefined,
    startDate: isValidDateString(search.startDate)
      ? search.startDate
      : undefined,
    endDate: isValidDateString(search.endDate) ? search.endDate : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    void context.queryClient.prefetchQuery(accountsQueryOptions())
    void context.queryClient.prefetchQuery(categoryFiltersQueryOptions())
    void context.queryClient.prefetchQuery(categoriesQueryOptions())
    await awaitSsrData(
      context.queryClient.ensureInfiniteQueryData({
        ...transactionsQueryOptions(initialTransactionParams(deps)),
        revalidateIfStale: true,
      }),
    )
  },
  component: TransactionsPage,
})

function TransactionsPage() {
  const search = Route.useSearch()
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const isMobile = useCompactLayout()
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
  const [deletingManualTransaction, setDeletingManualTransaction] =
    useState<Transaction | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Filter state
  const [dateRange, setDateRange] = useState<DatesRangeValue>(() => [
    search.startDate ? dayjs(search.startDate).toDate() : null,
    search.endDate ? dayjs(search.endDate).toDate() : null,
  ])
  const [accountId, setAccountId] = useState<string | null>(
    search.accountId ?? null,
  )
  const [categoryId, setCategoryId] = useState<string | null>(
    search.categoryId ?? null,
  )
  const [amountSign, setAmountSign] = useState('all')

  // Back/forward and deep-link navigation can reuse this mounted route.
  useEffect(() => {
    setAccountId(search.accountId ?? null)
    setCategoryId(search.categoryId ?? null)
    setDateRange([
      search.startDate ? dayjs(search.startDate).toDate() : null,
      search.endDate ? dayjs(search.endDate).toDate() : null,
    ])
  }, [search.accountId, search.categoryId, search.startDate, search.endDate])

  // Account data for the select dropdown
  const { data: accounts } = useAccountControllerFindAll()
  const { data: categories } = useCategoryControllerFindFilterOptions()
  const { data: assignableCategories = [] } = useCategoryControllerFindAll()
  const bulkUpdateCategories = useTransactionControllerBulkUpdateCategories()
  const undoBulkUpdateCategories =
    useTransactionControllerUndoBulkUpdateCategories()

  const invalidateTransactions = useCallback(() => {
    void invalidateMutationFamilies(queryClient, [
      'transactions',
      'analysis',
      'categories',
    ])
  }, [queryClient])
  const removeManualTransaction = useTransactionControllerRemoveManual()

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

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery(transactionsQueryOptions(queryParams))
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
    dateRange.some(Boolean) ||
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
    if (
      !isManualTransaction(transaction) ||
      removeManualTransaction.isPending
    ) {
      return
    }
    setDeleteError(null)
    setDeletingManualTransaction(transaction)
  }

  const confirmDeleteManualTransaction = () => {
    if (!deletingManualTransaction || removeManualTransaction.isPending) {
      return
    }

    setDeleteError(null)
    removeManualTransaction.mutate(
      { id: deletingManualTransaction.id },
      {
        onSuccess: () => {
          setDeletingManualTransaction(null)
          invalidateTransactions()
          notifications.show({
            title: 'Transaction deleted',
            message: 'The manual transaction was deleted.',
            color: 'green',
          })
        },
        onError: (error) => {
          setDeleteError(
            getApiErrorMessage(
              error,
              'The manual transaction was not deleted.',
            ),
          )
        },
      },
    )
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

  const activeFilterCount = [
    isMobile && dateRange.some(Boolean) ? 'dates' : null,
    accountId,
    categoryId,
    amountSign !== 'all' ? amountSign : null,
  ].filter(Boolean).length

  const filterButtonLabel =
    activeFilterCount > 0
      ? `Open transaction filters, ${activeFilterCount} active`
      : 'Open transaction filters'

  const filterPanel = (
    <TransactionsFilterPanel
      accountId={accountId}
      accountOptions={accountOptions}
      amountSign={amountSign}
      categoryId={categoryId}
      categoryOptions={categoryOptions}
      dateRange={dateRange}
      hasActiveFilters={hasActiveFilters}
      isMobile={Boolean(isMobile)}
      onAccountChange={setAccountId}
      onAmountSignChange={setAmountSign}
      onCategoryChange={setCategoryId}
      onDateRangeChange={setDateRange}
      onClearFilters={clearFilters}
      onDone={closeFilters}
    />
  )

  const bulkEditSwitch = (
    <Switch
      checked={bulkModeEnabled}
      label="Bulk edit"
      onChange={(event) => setBulkModeEnabled(event.currentTarget.checked)}
    />
  )

  const addTransactionAction = isMobile ? (
    <ActionIcon
      aria-label="Add transaction"
      onClick={openCreateManualTransaction}
      size={40}
      variant="filled"
    >
      <Plus aria-hidden size={18} />
    </ActionIcon>
  ) : (
    <Button
      leftSection={<Plus size={16} />}
      onClick={openCreateManualTransaction}
      size="md"
      type="button"
    >
      Add transaction
    </Button>
  )

  const headerActions = (
    <Group gap="sm" wrap="nowrap" ml={isMobile ? undefined : 'auto'}>
      {isMobile && addTransactionAction}
      {bulkEditSwitch}
    </Group>
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
        actions={headerActions}
      />
      {manualModalOpened && (
        <DeferredFeature label="Transaction editor">
          <ManualTransactionModal
            accounts={accounts ?? []}
            categories={assignableCategories}
            defaultAccountId={accountId}
            opened={manualModalOpened}
            transaction={editingManualTransaction}
            onClose={closeManualTransactionModal}
            onSaved={invalidateTransactions}
          />
        </DeferredFeature>
      )}
      <ConfirmActionDialog
        opened={deletingManualTransaction !== null}
        title="Delete transaction"
        targetLabel={
          deletingManualTransaction?.merchantName ?? 'Manual transaction'
        }
        consequence="This removes the manual transaction from your history and analysis. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDeleteManualTransaction}
        onClose={() => {
          if (removeManualTransaction.isPending) return
          setDeletingManualTransaction(null)
          setDeleteError(null)
        }}
        isPending={removeManualTransaction.isPending}
        error={deleteError}
      />

      <Group
        mb={isMobile ? 'xs' : 'md'}
        gap="xs"
        wrap={isMobile ? 'wrap' : 'nowrap'}
        align="center"
      >
        {isMobile ? (
          <Button
            aria-label={filterButtonLabel}
            fullWidth
            h="auto"
            justify="space-between"
            leftSection={<Filter size={20} />}
            mih={48}
            onClick={toggleFilters}
            py="xs"
            rightSection={
              activeFilterCount > 0 ? (
                <Badge circle size="sm">
                  {activeFilterCount}
                </Badge>
              ) : null
            }
            variant="default"
          >
            <Text component="span" size="sm" style={{ whiteSpace: 'normal' }}>
              Filters · {formatDateRangeLabel(dateRange)}
            </Text>
          </Button>
        ) : (
          <DateRangeControl onChange={setDateRange} value={dateRange} />
        )}

        {isMobile ? (
          <Drawer
            opened={filtersOpened}
            onClose={closeFilters}
            title="Filters"
            position="bottom"
            size="min(680px, 90dvh)"
            padding="md"
          >
            {filterPanel}
          </Drawer>
        ) : (
          <Box pos="relative" ref={desktopFilterRef}>
            <ActionIcon
              aria-label={filterButtonLabel}
              variant={activeFilterCount > 0 ? 'light' : 'default'}
              size={42}
              onClick={toggleFilters}
            >
              <Filter size={18} />
            </ActionIcon>
            {activeFilterCount > 0 && (
              <Badge circle size="xs" pos="absolute" top={-6} right={-6}>
                {activeFilterCount}
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
        {!isMobile && bulkModeEnabled && (
          <TransactionBulkEditToolbar
            categoryOptions={assignableCategoryOptions}
            isSaving={bulkUpdateCategories.isPending}
            loadedCount={loadedTransactionIds.length}
            selectedCount={selectedCount}
            selectLoadedChecked={allLoadedSelected}
            selectLoadedIndeterminate={someLoadedSelected && !allLoadedSelected}
            value={bulkCategoryValue}
            onChange={setBulkCategoryValue}
            onSave={saveBulkCategoryUpdate}
            onToggleLoaded={toggleLoadedSelection}
            showSelectLoaded={false}
            variant="summary"
          />
        )}
        {!isMobile && <Box ml="auto">{addTransactionAction}</Box>}
      </Group>

      {isMobile && bulkModeEnabled && (
        <Box mb="md">
          <TransactionBulkEditToolbar
            categoryOptions={assignableCategoryOptions}
            isSaving={bulkUpdateCategories.isPending}
            loadedCount={loadedTransactionIds.length}
            selectedCount={selectedCount}
            selectLoadedChecked={allLoadedSelected}
            selectLoadedIndeterminate={someLoadedSelected && !allLoadedSelected}
            value={bulkCategoryValue}
            onChange={setBulkCategoryValue}
            onSave={saveBulkCategoryUpdate}
            onToggleLoaded={toggleLoadedSelection}
            showSelectLoaded
            variant="inline"
          />
        </Box>
      )}

      {isMobile ? (
        <TransactionsMobileList
          data={flatData}
          totalRows={totalRows}
          isLoading={isLoading}
          isError={isError}
          isFetching={isFetching}
          onRetry={() => void refetch()}
          isFetchingNextPage={isFetchingNextPage}
          onScrollNearBottom={fetchMoreOnScroll}
          bulkModeEnabled={bulkModeEnabled}
          selectedTransactionIds={selectedTransactionIds}
          onToggleTransactionSelection={toggleTransactionSelection}
          onEditManualTransaction={openEditManualTransaction}
          onDeleteManualTransaction={deleteManualTransaction}
        />
      ) : (
        <DataState
          hasData={flatData.length > 0}
          isLoading={isLoading}
          isError={isError}
          isFetching={isFetching}
          loadingMessage="Loading transactions…"
          errorMessage="Error loading transactions"
          emptyMessage="No transactions found."
          onRetry={() => void refetch()}
        >
          <TransactionsTable
            data={flatData}
            totalRows={totalRows}
            isLoading={false}
            isError={false}
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
        </DataState>
      )}
    </Flex>
  )
}
