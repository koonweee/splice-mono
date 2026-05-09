import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  Divider,
  Drawer,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Check, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  useCategoryControllerFindAll,
  useTransactionControllerUpdate,
  useTransactionControllerUpdateCategory,
  useTransactionControllerUpdateCategoryReview,
} from '../../api/clients/spliceAPI'
import { MoneyWithSignSign } from '../../api/models'
import {
  formatCategoryName,
  formatMoneyWithSign,
  formatPrimaryCategory,
} from '../../lib/format'
import { isAssignableCategoryOption } from '../../lib/category-options'
import {
  formatCounterpartyLabel,
  getMerchantDisplay,
  getMetadataDetails,
} from './transactionMetadata'
import styles from './TransactionsMobileList.module.css'
import statusBadgeStyles from './TransactionStatusBadge.module.css'
import type { UIEvent } from 'react'
import type { Category, Transaction } from '../../api/models'

type TransactionsMobileListProps = {
  data: Array<Transaction>
  isError: boolean
  isFetchingNextPage?: boolean
  isLoading: boolean
  onScrollNearBottom?: () => void
  totalRows: number
  bulkModeEnabled?: boolean
  selectedTransactionIds?: Set<string>
  onToggleTransactionSelection?: (transactionId: string) => void
}

function getCategoryLabel(transaction: Transaction) {
  const category = transaction.effectiveCategory
  if (!category) {
    return 'Uncategorized'
  }

  return category.source === 'user'
    ? category.detailed
    : formatCategoryName(category)
}

function getAssignableCategoryLabel(
  category: Pick<Category, 'primary' | 'detailed' | 'source'>,
) {
  return category.source === 'user'
    ? category.detailed
    : formatCategoryName(category)
}

function getAssignableCategoryPrimaryLabel(
  category: Pick<Category, 'primary' | 'source'>,
) {
  return category.source === 'user'
    ? category.primary
    : formatPrimaryCategory(category.primary)
}

function getAmountClass(transaction: Transaction) {
  const amount = transaction.convertedAmount ?? transaction.amount
  return amount.sign === MoneyWithSignSign.positive
    ? styles.positive
    : styles.negative
}

function groupTransactionsByDate(data: Array<Transaction>) {
  const groups = new Map<string, Array<Transaction>>()

  data.forEach((transaction) => {
    const transactions = groups.get(transaction.activityDate) ?? []
    transactions.push(transaction)
    groups.set(transaction.activityDate, transactions)
  })

  return Array.from(groups.entries())
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

function formatMetadataValue(value: string | null | undefined) {
  return value && value.trim().length > 0 ? value : null
}

function formatPaymentChannel(value: string | null | undefined) {
  const paymentChannel = formatMetadataValue(value)

  return paymentChannel && paymentChannel.toLowerCase() !== 'other'
    ? paymentChannel
    : null
}

function getBankActivityDate(transaction: Transaction) {
  return transaction.authorizedDate ?? transaction.providerDate
}

export function TransactionsMobileList({
  data,
  isError,
  isFetchingNextPage = false,
  isLoading,
  onScrollNearBottom,
  totalRows,
  bulkModeEnabled = false,
  selectedTransactionIds = new Set<string>(),
  onToggleTransactionSelection,
}: TransactionsMobileListProps) {
  const queryClient = useQueryClient()
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(
    null,
  )
  const [categorySearch, setCategorySearch] = useState('')
  const [reportingDateDraft, setReportingDateDraft] = useState<string | null>(
    null,
  )
  const activeTransaction =
    data.find((transaction) => transaction.id === activeTransactionId) ?? null
  const activeMerchant = activeTransaction
    ? getMerchantDisplay(activeTransaction)
    : null
  const activeDetails = activeTransaction
    ? getMetadataDetails(activeTransaction)
    : null
  const { data: categories = [] } = useCategoryControllerFindAll()
  const updateTransaction = useTransactionControllerUpdate({
    mutation: {
      onSuccess: () => {
        invalidateTransactionQueries(queryClient)
      },
    },
  })
  const updateCategory = useTransactionControllerUpdateCategory({
    mutation: {
      onSuccess: () => {
        setActiveTransactionId(null)
        setCategorySearch('')
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
  const categoryOptions = useMemo(
    () =>
      categories
        .filter(isAssignableCategoryOption)
        .map((category) => ({
          value: category.id,
          label: getAssignableCategoryLabel(category),
          primaryLabel: getAssignableCategoryPrimaryLabel(category),
          source: category.source,
        }))
        .sort(
          (left, right) =>
            left.label.localeCompare(right.label) ||
            left.primaryLabel.localeCompare(right.primaryLabel),
        ),
    [categories],
  )
  const currentReportingDateValue = activeTransaction
    ? (activeTransaction.reportingDateOverride ??
      activeTransaction.activityDate)
    : null
  const hasReportingDateDraftChange =
    activeTransaction !== null &&
    reportingDateDraft !== null &&
    reportingDateDraft !== currentReportingDateValue
  const activeBankActivityDate = activeTransaction
    ? getBankActivityDate(activeTransaction)
    : null

  useEffect(() => {
    if (!activeTransaction) {
      setReportingDateDraft(null)
      return
    }

    setReportingDateDraft(
      activeTransaction.reportingDateOverride ?? activeTransaction.activityDate,
    )
  }, [activeTransaction])

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    if (!onScrollNearBottom) {
      return
    }

    const { scrollHeight, scrollTop, clientHeight } = event.currentTarget
    if (scrollHeight - scrollTop - clientHeight < 400) {
      onScrollNearBottom()
    }
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

  function toggleBulkSelection(transaction: Transaction) {
    onToggleTransactionSelection?.(transaction.id)
  }

  if (isLoading) {
    return (
      <div className={styles.footer}>
        <Loader size="sm" />
      </div>
    )
  }

  if (isError) {
    return (
      <Text c="red" size="sm">
        Error loading transactions
      </Text>
    )
  }

  if (data.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No transactions found.
      </Text>
    )
  }

  return (
    <>
      <div
        aria-label={`Transactions list, ${totalRows.toLocaleString()} total`}
        className={styles.list}
        onScroll={handleScroll}
      >
        {groupTransactionsByDate(data).map(([date, transactions]) => (
          <section className={styles.dateGroup} key={date}>
            <div className={styles.dateHeader}>
              {dayjs(date).format('MMMM D, YYYY')}
            </div>
            {transactions.map((transaction) => {
              const merchantDisplay = getMerchantDisplay(transaction)
              const avatarLabel = merchantDisplay.primary
                .trim()
                .slice(0, 1)
                .toUpperCase()
              const amount = transaction.convertedAmount ?? transaction.amount

              return (
                <UnstyledButton
                  aria-label={
                    bulkModeEnabled
                      ? `Select transaction ${merchantDisplay.primary}`
                      : `Open transaction details for ${merchantDisplay.primary}`
                  }
                  className={`${styles.row} ${
                    bulkModeEnabled &&
                    selectedTransactionIds.has(transaction.id)
                      ? styles.selectedRow
                      : ''
                  }`}
                  key={transaction.id}
                  onClick={() => {
                    if (bulkModeEnabled) {
                      toggleBulkSelection(transaction)
                      return
                    }

                    setActiveTransactionId(transaction.id)
                  }}
                >
                  <div className={styles.rowMain}>
                    {bulkModeEnabled && (
                      <Checkbox
                        aria-label={`Select transaction ${merchantDisplay.primary}`}
                        checked={selectedTransactionIds.has(transaction.id)}
                        onChange={() => toggleBulkSelection(transaction)}
                        onClick={(event) => event.stopPropagation()}
                        size="md"
                      />
                    )}
                    <Avatar
                      classNames={{ root: styles.merchantAvatar }}
                      radius="sm"
                      size={28}
                      src={transaction.logoUrl}
                    >
                      {avatarLabel}
                    </Avatar>
                    <div className={styles.rowDetails}>
                      <div className={styles.merchantLine}>
                        <span className={styles.merchant}>
                          {merchantDisplay.primary}
                        </span>
                      </div>
                      {(transaction.pending ||
                        transaction.categoryNeedsReview) && (
                        <div className={styles.statusLine}>
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
                          {!transaction.pending &&
                            transaction.categoryNeedsReview && (
                              <Badge
                                classNames={{
                                  root: `${statusBadgeStyles.statusBadge} ${statusBadgeStyles.reviewBadge}`,
                                }}
                                color="orange"
                                size="xs"
                                variant="light"
                              >
                                Needs review
                              </Badge>
                            )}
                        </div>
                      )}
                      <div className={styles.metaLine}>
                        <span className={styles.meta}>
                          {[
                            transaction.accountName,
                            getCategoryLabel(transaction),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                      {formatPaymentChannel(transaction.paymentChannel) && (
                        <div className={styles.metaLine}>
                          <span className={styles.meta}>
                            {formatPaymentChannel(transaction.paymentChannel)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={styles.rowAside}>
                    <span
                      className={`${styles.amount} ${getAmountClass(
                        transaction,
                      )}`}
                    >
                      {formatMoneyWithSign({ value: amount })}
                    </span>
                  </div>
                </UnstyledButton>
              )
            })}
          </section>
        ))}
        {isFetchingNextPage && (
          <div className={styles.footer}>
            <Loader size="sm" />
          </div>
        )}
      </div>
      <Drawer
        opened={activeTransaction !== null}
        onClose={() => {
          setActiveTransactionId(null)
          setCategorySearch('')
        }}
        position="bottom"
        size="auto"
        title={activeMerchant?.primary ?? 'Transaction'}
      >
        {activeTransaction && activeDetails && (
          <Stack gap="md">
            <div>
              <Group justify="space-between" wrap="nowrap">
                <Text c="dimmed" size="sm">
                  {dayjs(activeTransaction.activityDate).format('MMM D, YYYY')}
                </Text>
                <Text
                  className={`${styles.drawerAmount} ${getAmountClass(
                    activeTransaction,
                  )}`}
                >
                  {formatMoneyWithSign({
                    value:
                      activeTransaction.convertedAmount ??
                      activeTransaction.amount,
                  })}
                </Text>
              </Group>
              <Text c="dimmed" size="sm">
                {[
                  activeTransaction.accountName,
                  activeTransaction.paymentChannel,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </div>

            <Stack gap={6}>
              <TextInput
                label="Reporting date"
                type="date"
                value={reportingDateDraft ?? ''}
                onChange={(event) =>
                  setReportingDateDraft(event.currentTarget.value || null)
                }
              />
              <Group gap="xs" grow>
                <Button
                  disabled={!hasReportingDateDraftChange}
                  leftSection={<Check size={16} />}
                  loading={
                    updateTransaction.isPending &&
                    updateTransaction.variables.id === activeTransaction.id
                  }
                  onClick={() => {
                    if (!reportingDateDraft) {
                      return
                    }

                    updateTransaction.mutate({
                      id: activeTransaction.id,
                      data: { reportingDateOverride: reportingDateDraft },
                    })
                  }}
                  variant="light"
                >
                  Apply date
                </Button>
                {activeTransaction.reportingDateOverride != null && (
                  <Button
                    color="gray"
                    leftSection={<RotateCcw size={16} />}
                    loading={
                      updateTransaction.isPending &&
                      updateTransaction.variables.id === activeTransaction.id
                    }
                    onClick={() =>
                      updateTransaction.mutate({
                        id: activeTransaction.id,
                        data: { reportingDateOverride: null },
                      })
                    }
                    variant="light"
                  >
                    Use bank date
                  </Button>
                )}
              </Group>
              {activeTransaction.reportingDateOverride != null && (
                <Text c="dimmed" size="xs">
                  Bank date{' '}
                  {activeBankActivityDate
                    ? dayjs(activeBankActivityDate).format('MMM D, YYYY')
                    : ''}
                </Text>
              )}
            </Stack>

            <Stack gap={6}>
              <TextInput
                aria-label="Search categories"
                label="Category"
                onChange={(event) =>
                  setCategorySearch(event.currentTarget.value)
                }
                placeholder={getCategoryLabel(activeTransaction)}
                value={categorySearch}
              />
              <div
                aria-label="Categories"
                className={styles.categoryOptionsList}
                role="listbox"
              >
                {categoryOptions
                  .filter((option) =>
                    `${option.label} ${option.primaryLabel}`
                      .toLowerCase()
                      .includes(categorySearch.toLowerCase()),
                  )
                  .map((option) => (
                    <UnstyledButton
                      aria-selected={
                        option.value === activeTransaction.effectiveCategoryId
                      }
                      className={styles.categoryOption}
                      key={option.value}
                      onClick={() =>
                        updateCategory.mutate({
                          id: activeTransaction.id,
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
                  ))}
                {categoryOptions.length === 0 && (
                  <Text c="dimmed" px="xs" py={6} size="sm">
                    No categories found
                  </Text>
                )}
              </div>
            </Stack>

            <Group gap="xs" grow>
              {activeTransaction.categoryNeedsReview && (
                <Button
                  leftSection={<Check size={16} />}
                  loading={
                    updateCategoryReview.isPending &&
                    updateCategoryReview.variables.id === activeTransaction.id
                  }
                  onClick={() => markCategoryReviewed(activeTransaction)}
                  variant="light"
                >
                  Mark reviewed
                </Button>
              )}
              {activeTransaction.userCategoryId !== null && (
                <Button
                  color="gray"
                  leftSection={<RotateCcw size={16} />}
                  loading={
                    updateCategory.isPending &&
                    updateCategory.variables.id === activeTransaction.id
                  }
                  onClick={() =>
                    updateCategory.mutate({
                      id: activeTransaction.id,
                      data: { categoryId: null },
                    })
                  }
                  variant="light"
                >
                  Reset override
                </Button>
              )}
            </Group>

            <Divider />

            <Stack gap="xs">
              <MetadataItem label="Display" value={activeMerchant?.primary} />
              <MetadataItem
                label="Raw description"
                value={formatMetadataValue(
                  activeTransaction.originalDescription,
                )}
              />
              <MetadataItem
                label="Provider name"
                value={formatMetadataValue(
                  activeTransaction.providerTransactionName,
                )}
              />
              {activeDetails.counterparties.length > 0 && (
                <Stack gap={2}>
                  <Text c="dimmed" size="xs" tt="uppercase">
                    Counterparties
                  </Text>
                  {activeDetails.counterparties.map((counterparty) => (
                    <Text
                      key={`${counterparty.name}-${counterparty.type}`}
                      size="sm"
                    >
                      {formatCounterpartyLabel(counterparty)}
                    </Text>
                  ))}
                </Stack>
              )}
              <MetadataItem
                label="Plaid category"
                value={[
                  activeDetails.categoryPrimaryLabel,
                  activeDetails.categoryLabel,
                  activeDetails.categoryConfidence &&
                    `${activeDetails.categoryConfidence.toLowerCase()} confidence`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
              <MetadataItem
                label="Authorized"
                value={activeDetails.authorizedAt}
              />
            </Stack>
          </Stack>
        )}
      </Drawer>
    </>
  )
}

function MetadataItem({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  if (!value) {
    return null
  }

  return (
    <Stack gap={2}>
      <Text c="dimmed" size="xs" tt="uppercase">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Stack>
  )
}
