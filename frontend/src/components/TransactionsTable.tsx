import {
  ActionIcon,
  Anchor,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Popover,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { DatePicker } from '@mantine/dates'
import { useMediaQuery } from '@mantine/hooks'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Check, Info, Pencil, RotateCcw, X } from 'lucide-react'
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useCategoryControllerFindAll,
  useTransactionControllerUpdate,
  useTransactionControllerUpdateCategory,
} from '../api/clients/spliceAPI'
import { isAssignableCategoryOption } from '../lib/category-options'
import { CategorySelect } from './categories/CategorySelect'
import tableChrome from './MantineTableChrome.module.css'
import styles from './TransactionsTable.module.css'
import statusBadgeStyles from './transactions/TransactionStatusBadge.module.css'
import {
  formatCounterpartyLabel,
  getMerchantDisplay,
  getMetadataDetails,
  getProviderCategoryHint,
} from './transactions/transactionMetadata'
import type { MRT_ColumnDef, MRT_SortingState } from 'mantine-react-table'
import type { ReactNode } from 'react'
import type { Category, Transaction } from '../api/models'
import type { CategorySelectOption } from './categories/CategorySelect'
import { formatMoneyWithSign } from '@/lib/format'

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
  bulkModeEnabled?: boolean
  selectedTransactionIds?: Set<string>
  onToggleTransactionSelection?: (transactionId: string) => void
  onToggleLoadedSelection?: () => void
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
      classNames={{ dropdown: styles.metadataPopover }}
      position="bottom-start"
      shadow="md"
      width={360}
      withinPortal
    >
      <Popover.Target>
        <ActionIcon
          aria-label={`Show transaction details for ${details.merchantDisplay.primary}`}
          classNames={{ root: styles.merchantInfoButton }}
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
            <MetadataRow label="Provider category">
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

function MerchantCell({
  row,
  bulkModeEnabled = false,
}: {
  row: { original: Transaction }
  bulkModeEnabled?: boolean
}) {
  const transaction = row.original
  const merchantDisplay = getMerchantDisplay(transaction)
  const avatarLabel = merchantDisplay.primary.trim().slice(0, 1).toUpperCase()

  return (
    <Group className={styles.merchantCell} gap="xs" wrap="nowrap">
      <Avatar
        classNames={{ root: styles.merchantAvatar }}
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
          {!bulkModeEnabled && (
            <TransactionInfoPopover transaction={transaction} />
          )}
          {transaction.pending && (
            <Badge
              classNames={{
                root: `${statusBadgeStyles.statusBadge} ${statusBadgeStyles.pendingBadge}`,
              }}
              color="yellow"
              size="xs"
              variant="light"
            >
              Pending
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

function ProviderCategoryHintPopover({
  transaction,
}: {
  transaction: Transaction
}) {
  const [opened, setOpened] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)
  const supportsHover = useMediaQuery(
    '(hover: hover) and (pointer: fine)',
    false,
    { getInitialValueInEffect: false },
  )
  const providerCategoryHint = getProviderCategoryHint(transaction)
  const displayLabel = formatMetadataValue(providerCategoryHint?.displayLabel)

  if (transaction.category || !providerCategoryHint || !displayLabel) {
    return null
  }

  const confidence = formatMetadataValue(providerCategoryHint.confidenceLevel)

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

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      classNames={{ dropdown: styles.metadataPopover }}
      position="bottom-start"
      shadow="md"
      width={260}
      withinPortal
    >
      <Popover.Target>
        <ActionIcon
          aria-label={`Provider category hint: ${displayLabel}`}
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
        onBlur={supportsHover ? scheduleClosePopover : undefined}
        onFocus={supportsHover ? openPopover : undefined}
        onMouseEnter={supportsHover ? openPopover : undefined}
        onMouseLeave={supportsHover ? closePopover : undefined}
      >
        <Stack gap={6}>
          <Group gap="xs" wrap="nowrap">
            {providerCategoryHint.iconUrl && (
              <Avatar
                radius="sm"
                size={20}
                src={providerCategoryHint.iconUrl}
              />
            )}
            <Text fw={600} size="sm">
              {displayLabel}
            </Text>
          </Group>
          {confidence && (
            <Text c="dimmed" size="xs">
              Provider hint · {confidence.toLowerCase()} confidence
            </Text>
          )}
          {!confidence && (
            <Text c="dimmed" size="xs">
              Provider hint
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
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
      (query.queryKey[0].includes('transaction') ||
        query.queryKey[0].includes('category')),
  })
}

function getCategoryLabel(category: Pick<Category, 'primary' | 'detailed'>) {
  return category.detailed
}

function getCategoryPrimaryLabel(category: Pick<Category, 'primary'>) {
  return category.primary
}

function getBankActivityDate(transaction: Transaction) {
  return transaction.authorizedDate ?? transaction.providerDate
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
  bulkModeEnabled = false,
  selectedTransactionIds = new Set<string>(),
  onToggleTransactionSelection,
  onToggleLoadedSelection,
}: TransactionsTableProps) {
  const queryClient = useQueryClient()
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null)
  const [
    editingReportingDateTransactionId,
    setEditingReportingDateTransactionId,
  ] = useState<string | null>(null)
  const [reportingDateDraft, setReportingDateDraft] = useState<string | null>(
    null,
  )

  useEffect(() => {
    if (!bulkModeEnabled) {
      return
    }

    setEditingTransactionId(null)
    setEditingReportingDateTransactionId(null)
    setReportingDateDraft(null)
  }, [bulkModeEnabled])
  const { data: categories = [] } = useCategoryControllerFindAll()
  const updateTransaction = useTransactionControllerUpdate({
    mutation: {
      onSuccess: () => {
        closeReportingDateEditor()
        invalidateTransactionQueries(queryClient)
      },
    },
  })
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
  }

  function openReportingDateEditor(transaction: Transaction) {
    setEditingReportingDateTransactionId(transaction.id)
    setReportingDateDraft(
      transaction.reportingDateOverride ?? transaction.activityDate,
    )
  }

  function closeReportingDateEditor() {
    setEditingReportingDateTransactionId(null)
    setReportingDateDraft(null)
  }

  function saveReportingDateOverride(transaction: Transaction) {
    if (!reportingDateDraft) {
      return
    }

    updateTransaction.mutate({
      id: transaction.id,
      data: { reportingDateOverride: reportingDateDraft },
    })
  }

  function resetReportingDateOverride(transaction: Transaction) {
    updateTransaction.mutate({
      id: transaction.id,
      data: { reportingDateOverride: null },
    })
  }

  function toggleBulkSelection(transaction: Transaction) {
    onToggleTransactionSelection?.(transaction.id)
  }

  const categoryOptions = useMemo(
    (): Array<CategorySelectOption> =>
      categories
        .filter(isAssignableCategoryOption)
        .map((category) => ({
          value: category.id,
          primary: getCategoryPrimaryLabel(category),
          secondary: getCategoryLabel(category),
        }))
        .sort(
          (left, right) =>
            left.primary.localeCompare(right.primary) ||
            left.secondary.localeCompare(right.secondary),
        ),
    [categories],
  )
  const selectedLoadedCount = data.filter((transaction) =>
    selectedTransactionIds.has(transaction.id),
  ).length
  const allLoadedSelected =
    data.length > 0 && selectedLoadedCount === data.length
  const someLoadedSelected = selectedLoadedCount > 0

  const allColumns = useMemo<Array<MRT_ColumnDef<Transaction>>>(
    () => [
      ...(bulkModeEnabled
        ? [
            {
              id: 'bulkSelect',
              header: '',
              Header: () => (
                <Checkbox
                  aria-label="Select all loaded transactions"
                  checked={allLoadedSelected}
                  disabled={data.length === 0}
                  indeterminate={someLoadedSelected && !allLoadedSelected}
                  onChange={() => onToggleLoadedSelection?.()}
                  onClick={(event) => event.stopPropagation()}
                />
              ),
              enableSorting: false,
              size: 48,
              minSize: 48,
              maxSize: 48,
              Cell: ({ row }) => {
                const transaction = row.original

                return (
                  <Checkbox
                    aria-label={`Select transaction ${getMerchantDisplay(transaction).primary}`}
                    checked={selectedTransactionIds.has(transaction.id)}
                    onChange={() => toggleBulkSelection(transaction)}
                    onClick={(event) => event.stopPropagation()}
                  />
                )
              },
            } satisfies MRT_ColumnDef<Transaction>,
          ]
        : []),
      {
        accessorKey: 'activityDate',
        header: 'Date',
        size: 150,
        minSize: 90,
        maxSize: 220,
        Cell: ({ row }) => {
          const transaction = row.original
          const isEditing = editingReportingDateTransactionId === transaction.id
          const hasOverride = transaction.reportingDateOverride != null
          const bankActivityDate = getBankActivityDate(transaction)
          const dateLabel = dayjs(transaction.activityDate).format(
            'MMM D, YYYY',
          )
          const resetDateLabel = dayjs(bankActivityDate).format('MMM D, YYYY')

          if (isEditing && !bulkModeEnabled) {
            return (
              <Group className={styles.dateCell} gap={4} wrap="nowrap">
                <Popover
                  opened
                  onDismiss={closeReportingDateEditor}
                  position="bottom-start"
                  shadow="md"
                  withinPortal
                  zIndex={400}
                >
                  <Popover.Target>
                    <UnstyledButton
                      aria-label="Reporting date"
                      className={styles.dateTrigger}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          closeReportingDateEditor()
                        }
                      }}
                    >
                      <Text className={styles.dateLabel} size="sm" span>
                        {reportingDateDraft
                          ? dayjs(reportingDateDraft).format('MMM D, YYYY')
                          : dateLabel}
                      </Text>
                    </UnstyledButton>
                  </Popover.Target>
                  <Popover.Dropdown p="sm">
                    <Stack gap="sm">
                      <DatePicker
                        value={reportingDateDraft}
                        onChange={setReportingDateDraft}
                      />
                      <Group justify="space-between" wrap="nowrap">
                        <Button
                          leftSection={<Check size={14} />}
                          loading={
                            updateTransaction.isPending &&
                            updateTransaction.variables.id === transaction.id
                          }
                          onClick={() => saveReportingDateOverride(transaction)}
                          size="xs"
                        >
                          Apply
                        </Button>
                        <Button
                          onClick={closeReportingDateEditor}
                          size="xs"
                          variant="subtle"
                        >
                          Cancel
                        </Button>
                      </Group>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
                <Tooltip label="Cancel">
                  <ActionIcon
                    aria-label="Cancel reporting date edit"
                    onClick={closeReportingDateEditor}
                    size="sm"
                    variant="subtle"
                  >
                    <X size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            )
          }

          return (
            <Group className={styles.dateCell} gap={4} wrap="nowrap">
              <Text
                aria-label={`Activity date ${dateLabel}`}
                className={styles.dateText}
                size="sm"
              >
                {dateLabel}
              </Text>
              {!bulkModeEnabled && (
                <Group className={styles.dateActions} gap={2} wrap="nowrap">
                  <Tooltip label="Edit reporting date">
                    <ActionIcon
                      aria-label="Edit reporting date"
                      onClick={() => openReportingDateEditor(transaction)}
                      size="sm"
                      variant="subtle"
                    >
                      <Pencil size={14} />
                    </ActionIcon>
                  </Tooltip>
                  {hasOverride && (
                    <Tooltip label={`Reset to bank date: ${resetDateLabel}`}>
                      <ActionIcon
                        aria-label="Reset reporting date override"
                        loading={
                          updateTransaction.isPending &&
                          updateTransaction.variables.id === transaction.id
                        }
                        onClick={() => resetReportingDateOverride(transaction)}
                        size="sm"
                        variant="subtle"
                      >
                        <RotateCcw size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              )}
            </Group>
          )
        },
      },
      {
        accessorKey: 'merchantName',
        header: 'Description',
        size: 260,
        minSize: 180,
        maxSize: 420,
        Cell: ({ row }) => (
          <MerchantCell row={row} bulkModeEnabled={bulkModeEnabled} />
        ),
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
          row.category ? getCategoryLabel(row.category) : 'Uncategorized',
        mantineTableBodyCellProps: {
          className: styles.categoryTableCell,
        },
        mantineTableHeadCellProps: {
          className: styles.categoryTableCell,
        },
        Cell: ({ row }) => {
          const transaction = row.original
          const category = transaction.category ?? null
          const isEditing = editingTransactionId === transaction.id
          const categoryLabel = category
            ? getCategoryLabel(category)
            : 'Uncategorized'
          if (isEditing && !bulkModeEnabled) {
            return (
              <Group className={styles.categoryCell} gap={4} wrap="nowrap">
                <CategorySelect
                  aria-label="Category"
                  autoFocus
                  data={categoryOptions}
                  onChange={(value) =>
                    updateCategory.mutate({
                      id: transaction.id,
                      data: { categoryId: value },
                    })
                  }
                  onDropdownClose={closeCategoryEditor}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      closeCategoryEditor()
                    }
                  }}
                  placeholder="Category"
                  size="md"
                  value={transaction.categoryId}
                  w={280}
                  comboboxProps={{ withinPortal: true, zIndex: 400 }}
                />
              </Group>
            )
          }

          return (
            <Group className={styles.categoryCell} gap={4} wrap="nowrap">
              <Badge
                aria-label={categoryLabel}
                classNames={{
                  root: `${styles.categoryBadge} ${
                    category ? getCategoryToneClass(categoryLabel) : ''
                  }`,
                }}
                radius="sm"
                size="sm"
                variant="outline"
              >
                {categoryLabel}
              </Badge>
              <ProviderCategoryHintPopover transaction={transaction} />
              {!bulkModeEnabled && (
                <Group className={styles.categoryActions} gap={2} wrap="nowrap">
                  <Tooltip label="Edit category">
                    <ActionIcon
                      aria-label="Edit category"
                      variant="subtle"
                      size="sm"
                      onClick={() => {
                        setEditingTransactionId(transaction.id)
                      }}
                    >
                      <Pencil size={14} />
                    </ActionIcon>
                  </Tooltip>
                  {category && (
                    <Tooltip label="Clear category">
                      <ActionIcon
                        aria-label="Clear category"
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
              )}
            </Group>
          )
        },
      },
    ],
    [
      bulkModeEnabled,
      categoryOptions,
      editingReportingDateTransactionId,
      editingTransactionId,
      reportingDateDraft,
      selectedTransactionIds,
      onToggleTransactionSelection,
      updateTransaction.isPending,
      updateTransaction.mutate,
      updateTransaction.variables?.id,
      updateCategory.isPending,
      updateCategory.mutate,
      updateCategory.variables?.id,
      allLoadedSelected,
      data.length,
      onToggleLoadedSelection,
      someLoadedSelected,
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
  const columnOrder = visibleColumns.map((col) =>
    String(col.id ?? col.accessorKey),
  )

  const table = useMantineReactTable({
    columns: visibleColumns,
    data,
    getRowId: (row) => row.id,
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
      columnOrder,
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
      className: tableChrome.table,
    },
    mantineTableBodyRowProps: ({ row }) => ({
      className:
        bulkModeEnabled && selectedTransactionIds.has(row.original.id)
          ? styles.bulkSelectedRow
          : undefined,
      onClick: bulkModeEnabled
        ? () => toggleBulkSelection(row.original)
        : undefined,
      style: bulkModeEnabled ? { cursor: 'pointer' } : undefined,
    }),
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
