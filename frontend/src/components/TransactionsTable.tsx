import {
  ActionIcon,
  Badge,
  Group,
  Popover,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Pencil, RotateCcw, X } from 'lucide-react'
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table'
import { useMemo, useState } from 'react'
import {
  useCategoryControllerFindAll,
  useTransactionControllerUpdateCategory,
} from '../api/clients/spliceAPI'
import styles from './TransactionsTable.module.css'
import type { MRT_ColumnDef, MRT_SortingState } from 'mantine-react-table'
import type { Category, Transaction } from '../api/models'
import {
  formatCategoryName,
  formatMoneyWithSign,
  formatPrimaryCategory,
} from '@/lib/format'

type HideableColumn = 'accountName' | 'category'

interface TransactionsTableProps {
  data: Array<Transaction>
  totalRows: number
  isLoading: boolean
  isError: boolean
  isFetchingNextPage?: boolean
  hiddenColumns?: Array<HideableColumn>
  enableVirtualization?: boolean
  onScrollNearBottom?: () => void
  manualSorting?: boolean
  sorting?: MRT_SortingState
  onSortingChange?: (
    updater: MRT_SortingState | ((prev: MRT_SortingState) => MRT_SortingState),
  ) => void
  mantinePaperProps?: Record<string, unknown>
  mantineTableContainerProps?: Record<string, unknown>
}

function AmountCell({ row }: { row: { original: Transaction } }) {
  const { amount, convertedAmount } = row.original
  const displayAmount = convertedAmount ?? amount

  const hasDifferentCurrency =
    convertedAmount && convertedAmount.money.currency !== amount.money.currency

  const formatted = formatMoneyWithSign({ value: displayAmount })

  if (hasDifferentCurrency) {
    const originalFormatted = formatMoneyWithSign({
      value: amount,
      appendCurrency: true,
    })
    return (
      <Tooltip label={`Original: ${originalFormatted}`} withArrow>
        <span>{formatted}</span>
      </Tooltip>
    )
  }

  return <>{formatted}</>
}

function invalidateTransactionQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      typeof query.queryKey[0] === 'string' &&
      query.queryKey[0].includes('transaction'),
  })
}

function getCategoryLabel(
  category: Pick<Category, 'primary' | 'detailed' | 'source'>,
) {
  return category.source === 'user'
    ? category.detailed
    : formatCategoryName(category)
}

function getCategoryPrimaryLabel(
  category: Pick<Category, 'primary' | 'source'>,
) {
  return category.source === 'user'
    ? category.primary
    : formatPrimaryCategory(category.primary)
}

export function TransactionsTable({
  data,
  totalRows,
  isLoading,
  isError,
  isFetchingNextPage = false,
  hiddenColumns = [],
  enableVirtualization = false,
  onScrollNearBottom,
  manualSorting = false,
  sorting,
  onSortingChange,
  mantinePaperProps,
  mantineTableContainerProps,
}: TransactionsTableProps) {
  const queryClient = useQueryClient()
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null)
  const [categorySearch, setCategorySearch] = useState('')
  const { data: categories = [] } = useCategoryControllerFindAll()
  const updateCategory = useTransactionControllerUpdateCategory({
    mutation: {
      onSuccess: () => {
        closeCategoryEditor()
        invalidateTransactionQueries(queryClient)
      },
    },
  })

  function closeCategoryEditor() {
    setEditingTransactionId(null)
    setCategorySearch('')
  }

  const categoryOptions = useMemo(
    () =>
      categories
        .map((category) => ({
          value: category.id,
          label: getCategoryLabel(category),
          primaryLabel: getCategoryPrimaryLabel(category),
          source: category.source,
        }))
        .sort(
          (left, right) =>
            left.label.localeCompare(right.label) ||
            left.primaryLabel.localeCompare(right.primaryLabel),
        ),
    [categories],
  )

  const allColumns = useMemo<Array<MRT_ColumnDef<Transaction>>>(
    () => [
      {
        accessorKey: 'date',
        header: 'Date',
        size: 110,
        minSize: 90,
        maxSize: 170,
        Cell: ({ cell }) =>
          dayjs(cell.getValue<string>()).format('MMM D, YYYY'),
      },
      {
        accessorKey: 'merchantName',
        header: 'Merchant',
        size: 130,
        minSize: 110,
        maxSize: 280,
        Cell: ({ cell }) => cell.getValue<string | null>() ?? '--',
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        size: 90,
        minSize: 80,
        maxSize: 150,
        Cell: AmountCell,
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
        size: 220,
        minSize: 120,
        maxSize: 480,
        accessorFn: (row) =>
          row.effectiveCategory
            ? getCategoryLabel(row.effectiveCategory)
            : '--',
        mantineTableBodyCellProps: {
          className: styles.categoryTableCell,
        },
        mantineTableHeadCellProps: {
          className: styles.categoryTableCell,
        },
        Cell: ({ row }) => {
          const transaction = row.original
          const category = transaction.effectiveCategory
          const isEditing = editingTransactionId === transaction.id
          const hasOverride = transaction.userCategoryId !== null
          const resetLabel = transaction.category
            ? `Reset to Plaid category: ${getCategoryLabel(transaction.category)}`
            : 'Reset to uncategorized'
          const categoryLabel = category ? getCategoryLabel(category) : '--'
          const filteredCategoryOptions = categoryOptions.filter((option) =>
            `${option.label} ${option.primaryLabel}`
              .toLowerCase()
              .includes(categorySearch.toLowerCase()),
          )

          if (isEditing) {
            return (
              <Group className={styles.categoryCell} gap={4} wrap="nowrap">
                <Popover
                  opened
                  onDismiss={closeCategoryEditor}
                  position="bottom-start"
                  shadow="md"
                  width={280}
                  withinPortal
                  zIndex={400}
                >
                  <Popover.Target>
                    <UnstyledButton
                      aria-label="Category"
                      aria-haspopup="listbox"
                      className={styles.categoryTrigger}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          closeCategoryEditor()
                        }
                      }}
                    >
                      <Text className={styles.categoryLabel} size="sm" span>
                        {categoryLabel}
                      </Text>
                    </UnstyledButton>
                  </Popover.Target>
                  <Popover.Dropdown p="xs">
                    <TextInput
                      aria-label="Search categories"
                      autoFocus
                      mb="xs"
                      onChange={(event) =>
                        setCategorySearch(event.currentTarget.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          closeCategoryEditor()
                        }
                      }}
                      placeholder="Search categories"
                      size="md"
                      value={categorySearch}
                    />
                    <div className={styles.categoryOptionsList}>
                      <div role="listbox">
                        {filteredCategoryOptions.length > 0 ? (
                          filteredCategoryOptions.map((option) => (
                            <UnstyledButton
                              aria-selected={
                                option.value === transaction.effectiveCategoryId
                              }
                              className={styles.categoryOption}
                              key={option.value}
                              onClick={() =>
                                updateCategory.mutate({
                                  id: transaction.id,
                                  data: { categoryId: option.value },
                                })
                              }
                              role="option"
                            >
                              <Text c="inherit" component="div" size="sm">
                                {option.label}
                              </Text>
                              <Group gap={6} wrap="nowrap">
                                <Text
                                  c="inherit"
                                  className={styles.categoryOptionMeta}
                                  component="div"
                                  size="xs"
                                >
                                  {option.primaryLabel}
                                </Text>
                                {option.source === 'user' && (
                                  <Badge size="xs" variant="light">
                                    User
                                  </Badge>
                                )}
                              </Group>
                            </UnstyledButton>
                          ))
                        ) : (
                          <Text c="dimmed" px="xs" py={6} size="sm">
                            No categories found
                          </Text>
                        )}
                      </div>
                    </div>
                  </Popover.Dropdown>
                </Popover>
                <Tooltip label="Cancel">
                  <ActionIcon
                    aria-label="Cancel category edit"
                    variant="subtle"
                    size="sm"
                    onClick={closeCategoryEditor}
                  >
                    <X size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            )
          }

          return (
            <Group className={styles.categoryCell} gap={4} wrap="nowrap">
              <Tooltip
                label={category ? getCategoryLabel(category) : '--'}
                disabled={!category}
                withArrow
              >
                <Text className={styles.categoryLabel} size="sm" span>
                  {category ? getCategoryLabel(category) : '--'}
                </Text>
              </Tooltip>
              <Group className={styles.categoryActions} gap={2} wrap="nowrap">
                <Tooltip label="Edit category">
                  <ActionIcon
                    aria-label="Edit category"
                    variant="subtle"
                    size="sm"
                    onClick={() => {
                      setEditingTransactionId(transaction.id)
                      setCategorySearch('')
                    }}
                  >
                    <Pencil size={14} />
                  </ActionIcon>
                </Tooltip>
                {hasOverride && (
                  <Tooltip label={resetLabel}>
                    <ActionIcon
                      aria-label="Reset category override"
                      variant="subtle"
                      size="sm"
                      loading={
                        updateCategory.isPending &&
                        updateCategory.variables.id === transaction.id
                      }
                      onClick={() =>
                        updateCategory.mutate({
                          id: transaction.id,
                          data: { categoryId: null },
                        })
                      }
                    >
                      <RotateCcw size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            </Group>
          )
        },
      },
      {
        accessorKey: 'pending',
        header: 'Status',
        enableResizing: false,
        size: 100,
        minSize: 100,
        maxSize: 100,
        grow: false,
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
    ],
    [
      categoryOptions,
      categorySearch,
      editingTransactionId,
      updateCategory.isPending,
      updateCategory.mutate,
      updateCategory.variables?.id,
    ],
  )

  const visibleColumns =
    hiddenColumns.length > 0
      ? allColumns.filter(
          (col) =>
            !hiddenColumns.includes(
              (col.accessorKey ?? col.id) as HideableColumn,
            ),
        )
      : allColumns

  const table = useMantineReactTable({
    columns: visibleColumns,
    data,
    rowCount: totalRows,
    enablePagination: false,
    manualSorting,
    ...(onSortingChange ? { onSortingChange } : {}),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    layoutMode: 'grid',
    enableRowVirtualization: enableVirtualization,
    state: {
      ...(sorting ? { sorting } : {}),
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
    mantineTableProps: {
      className: styles.transactionsTable,
    },
    mantineTableContainerProps: {
      ...mantineTableContainerProps,
      ...(onScrollNearBottom
        ? {
            onScroll: (e: React.UIEvent<HTMLDivElement>) => {
              const { scrollHeight, scrollTop, clientHeight } = e.currentTarget
              if (scrollHeight - scrollTop - clientHeight < 400) {
                onScrollNearBottom()
              }
            },
          }
        : {}),
    },
    mantinePaperProps,
    mantineToolbarAlertBannerProps: isError
      ? { color: 'red', children: 'Error loading transactions' }
      : undefined,
  })

  return <MantineReactTable table={table} />
}
