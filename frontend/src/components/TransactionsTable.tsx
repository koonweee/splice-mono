import {
  ActionIcon,
  Anchor,
  Avatar,
  Badge,
  Button,
  Divider,
  Group,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMediaQuery } from '@mantine/hooks'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Check, Info, Pencil, RotateCcw, X } from 'lucide-react'
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useCategoryControllerFindAll,
  useTransactionControllerUpdateCategory,
  useTransactionControllerUpdateCategoryReview,
} from '../api/clients/spliceAPI'
import styles from './TransactionsTable.module.css'
import {
  formatCounterpartyLabel,
  getCategoryReviewTooltip,
  getMerchantDisplay,
  getMetadataDetails,
} from './transactions/transactionMetadata'
import type { MRT_ColumnDef, MRT_SortingState } from 'mantine-react-table'
import type { ReactNode } from 'react'
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

function formatMetadataValue(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : null
}

function MetadataRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <Stack gap={2}>
      <Text c="dimmed" size="xs" tt="uppercase">
        {label}
      </Text>
      <Text component="div" size="sm">
        {children}
      </Text>
    </Stack>
  )
}

function TransactionInfoPopover({ transaction }: { transaction: Transaction }) {
  const [opened, setOpened] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)
  const supportsHover = useMediaQuery(
    '(hover: hover) and (pointer: fine)',
    false,
    { getInitialValueInEffect: false },
  )
  const details = getMetadataDetails(transaction)
  const rawDescription = formatMetadataValue(transaction.originalDescription)
  const providerName = formatMetadataValue(transaction.providerTransactionName)
  const paymentChannel = formatMetadataValue(transaction.paymentChannel)
  const website = formatMetadataValue(transaction.website)
  const categoryConfidence = formatMetadataValue(details.categoryConfidence)
  const categoryText =
    details.categoryPrimaryLabel && details.categoryLabel
      ? `${details.categoryPrimaryLabel} > ${details.categoryLabel}`
      : details.categoryLabel
  const hasPopoverContent =
    rawDescription ||
    providerName ||
    details.counterparties.length > 0 ||
    paymentChannel ||
    categoryConfidence ||
    details.authorizedAt ||
    website ||
    details.paymentProcessor ||
    transaction.accountOwner

  function clearCloseTimeout() {
    if (closeTimeoutRef.current === null) {
      return
    }

    window.clearTimeout(closeTimeoutRef.current)
    closeTimeoutRef.current = null
  }

  function openPopover() {
    clearCloseTimeout()
    setOpened(true)
  }

  function closePopover() {
    clearCloseTimeout()
    setOpened(false)
  }

  function scheduleClosePopover() {
    clearCloseTimeout()
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpened(false)
      closeTimeoutRef.current = null
    }, 100)
  }

  useEffect(
    () => () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current)
      }
    },
    [],
  )

  if (!hasPopoverContent) {
    return null
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      shadow="md"
      width={360}
      withinPortal
    >
      <Popover.Target>
        <ActionIcon
          aria-label={`Show transaction details for ${details.merchantDisplay.primary}`}
          className={styles.merchantInfoButton}
          onBlur={supportsHover ? scheduleClosePopover : undefined}
          onClick={(event) => {
            event.stopPropagation()
            if (supportsHover) {
              return
            }

            setOpened((current) => !current)
          }}
          onFocus={supportsHover ? openPopover : undefined}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
              return
            }

            event.preventDefault()
            event.stopPropagation()
            setOpened((current) => !current)
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseEnter={supportsHover ? openPopover : undefined}
          onMouseLeave={supportsHover ? scheduleClosePopover : undefined}
          size="sm"
          variant="subtle"
        >
          <Info size={14} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown
        className={styles.metadataPopover}
        onBlur={supportsHover ? scheduleClosePopover : undefined}
        onFocus={supportsHover ? openPopover : undefined}
        onMouseEnter={supportsHover ? openPopover : undefined}
        onMouseLeave={supportsHover ? closePopover : undefined}
      >
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Transaction details
          </Text>
          <MetadataRow label="Display">
            {details.merchantDisplay.primary}
          </MetadataRow>
          {rawDescription && (
            <MetadataRow label="Raw description">{rawDescription}</MetadataRow>
          )}
          {providerName && providerName !== rawDescription && (
            <MetadataRow label="Provider name">{providerName}</MetadataRow>
          )}
          {details.counterparties.length > 0 && (
            <MetadataRow label="Counterparties">
              <Stack gap={2}>
                {details.counterparties.map((counterparty) => (
                  <Text
                    key={`${counterparty.name}-${counterparty.type}`}
                    size="sm"
                  >
                    {formatCounterpartyLabel(counterparty)}
                  </Text>
                ))}
              </Stack>
            </MetadataRow>
          )}
          {(paymentChannel || details.paymentProcessor) && (
            <MetadataRow label="Payment">
              {[
                paymentChannel,
                details.paymentProcessor && `via ${details.paymentProcessor}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </MetadataRow>
          )}
          {(categoryText || categoryConfidence) && (
            <MetadataRow label="Plaid category">
              {[
                categoryText,
                categoryConfidence &&
                  `${categoryConfidence.toLowerCase()} confidence`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </MetadataRow>
          )}
          {details.authorizedAt && (
            <MetadataRow label="Authorized">{details.authorizedAt}</MetadataRow>
          )}
          {transaction.accountOwner && (
            <MetadataRow label="Account owner">
              {transaction.accountOwner}
            </MetadataRow>
          )}
          {website && (
            <>
              <Divider />
              <Anchor
                href={
                  website.startsWith('http') ? website : `https://${website}`
                }
                size="sm"
                target="_blank"
              >
                {website}
              </Anchor>
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

function MerchantCell({ row }: { row: { original: Transaction } }) {
  const transaction = row.original
  const merchantDisplay = getMerchantDisplay(transaction)
  const avatarLabel = merchantDisplay.primary.trim().slice(0, 1).toUpperCase()

  return (
    <Group className={styles.merchantCell} gap="xs" wrap="nowrap">
      <Avatar
        className={styles.merchantAvatar}
        radius="sm"
        size={28}
        src={transaction.logoUrl}
      >
        {avatarLabel}
      </Avatar>
      <Stack className={styles.merchantText} gap={1}>
        <Group gap={4} wrap="nowrap">
          <Text className={styles.merchantPrimary} size="sm" span>
            {merchantDisplay.primary}
          </Text>
          <TransactionInfoPopover transaction={transaction} />
          {transaction.pending && (
            <Badge
              className={`${styles.statusBadge} ${styles.pendingBadge}`}
              color="yellow"
              size="xs"
              variant="light"
            >
              Pending
            </Badge>
          )}
          {transaction.categoryNeedsReview && (
            <Badge
              className={`${styles.statusBadge} ${styles.reviewBadge}`}
              color="orange"
              size="xs"
              variant="light"
            >
              Needs review
            </Badge>
          )}
        </Group>
        {merchantDisplay.secondary && (
          <Text c="dimmed" className={styles.merchantSecondary} size="xs">
            {merchantDisplay.secondary}
          </Text>
        )}
      </Stack>
    </Group>
  )
}

function AmountCell({ row }: { row: { original: Transaction } }) {
  const { amount, convertedAmount } = row.original
  const displayAmount = convertedAmount ?? amount

  const hasDifferentCurrency =
    convertedAmount && convertedAmount.money.currency !== amount.money.currency

  const formatted = formatMoneyWithSign({ value: displayAmount })
  const amountNode = (
    <Text
      className={`${styles.amountText} ${
        displayAmount.sign === 'positive' ? styles.positive : styles.negative
      }`}
      component="span"
      span
    >
      {formatted}
    </Text>
  )

  if (hasDifferentCurrency) {
    const originalFormatted = formatMoneyWithSign({
      value: amount,
      appendCurrency: true,
    })
    return (
      <Tooltip label={`Original: ${originalFormatted}`} withArrow>
        {amountNode}
      </Tooltip>
    )
  }

  return amountNode
}

function getCategoryToneClass(label: string) {
  const normalized = label.toLowerCase()

  if (
    normalized.includes('restaurant') ||
    normalized.includes('food') ||
    normalized.includes('groceries')
  ) {
    return styles.categoryFoodBadge
  }

  if (normalized.includes('deposit')) {
    return styles.categoryDepositBadge
  }

  if (normalized.includes('transfer')) {
    return styles.categoryTransferBadge
  }

  if (normalized.includes('electronics')) {
    return styles.categoryElectronicsBadge
  }

  if (
    normalized.includes('sport') ||
    normalized.includes('entertainment') ||
    normalized.includes('amusement')
  ) {
    return styles.categoryEntertainmentBadge
  }

  if (normalized.includes('service')) {
    return styles.categoryServiceBadge
  }

  return ''
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
  const updateCategoryReview = useTransactionControllerUpdateCategoryReview({
    mutation: {
      onSuccess: () => {
        invalidateTransactionQueries(queryClient)
      },
    },
  })

  function closeCategoryEditor() {
    setEditingTransactionId(null)
    setCategorySearch('')
  }

  function markCategoryReviewed(transaction: Transaction) {
    updateCategoryReview.mutate(
      { id: transaction.id, data: { reviewed: true } },
      {
        onSuccess: () => {
          notifications.show({
            title: 'Category reviewed',
            message: (
              <Group gap="xs" wrap="nowrap">
                <Text size="sm">Category marked as reviewed.</Text>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() =>
                    updateCategoryReview.mutate({
                      id: transaction.id,
                      data: { reviewed: false },
                    })
                  }
                >
                  Undo
                </Button>
              </Group>
            ),
            color: 'green',
          })
        },
      },
    )
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
        accessorKey: 'activityDate',
        header: 'Date',
        size: 110,
        minSize: 90,
        maxSize: 170,
        Cell: ({ cell }) =>
          dayjs(cell.getValue<string>()).format('MMM D, YYYY'),
      },
      {
        accessorKey: 'merchantName',
        header: 'Description',
        size: 260,
        minSize: 180,
        maxSize: 420,
        Cell: MerchantCell,
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        size: 110,
        minSize: 80,
        maxSize: 150,
        mantineTableBodyCellProps: {
          className: styles.amountTableCell,
        },
        mantineTableHeadCellProps: {
          className: styles.amountTableCell,
        },
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
          const needsReview = transaction.categoryNeedsReview
          const metadataDetails = getMetadataDetails(transaction)
          const reviewTooltip = getCategoryReviewTooltip(
            transaction,
            metadataDetails,
          )
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
                label={needsReview ? reviewTooltip : categoryLabel}
                disabled={!category}
                withArrow
              >
                <Badge
                  aria-label={needsReview ? reviewTooltip : categoryLabel}
                  className={`${styles.categoryBadge} ${
                    category ? getCategoryToneClass(categoryLabel) : ''
                  } ${
                    needsReview ? styles.categoryReviewBadge : ''
                  } ${hasOverride ? styles.categoryOverrideBadge : ''}`}
                  radius="sm"
                  size="sm"
                  variant="outline"
                >
                  {categoryLabel}
                </Badge>
              </Tooltip>
              <Group className={styles.categoryActions} gap={2} wrap="nowrap">
                {needsReview && (
                  <Tooltip label="Mark category as reviewed">
                    <ActionIcon
                      aria-label="Mark category as reviewed"
                      variant="subtle"
                      size="sm"
                      loading={
                        updateCategoryReview.isPending &&
                        updateCategoryReview.variables.id === transaction.id
                      }
                      onClick={() => markCategoryReviewed(transaction)}
                    >
                      <Check size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
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
    ],
    [
      categoryOptions,
      categorySearch,
      editingTransactionId,
      updateCategory.isPending,
      updateCategory.mutate,
      updateCategory.variables?.id,
      updateCategoryReview.isPending,
      updateCategoryReview.mutate,
      updateCategoryReview.variables?.id,
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
