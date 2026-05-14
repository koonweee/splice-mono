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
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Check, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  useCategoryControllerFindAll,
  useTransactionControllerUpdate,
  useTransactionControllerUpdateCategory,
} from '../../api/clients/spliceAPI'
import { MoneyWithSignSign } from '../../api/models'
import {
  getCategoryColorStyles,
  getFallbackCategoryColor,
} from '../../lib/category-colors'
import { formatMoneyWithSign } from '../../lib/format'
import { isAssignableCategoryOption } from '../../lib/category-options'
import {
  getViewportAwareComboboxProps,
  viewportAwareDropdownMaxHeight,
} from '../../lib/mobile-combobox'
import { CategorySelect } from '../categories/CategorySelect'
import {
  formatCounterpartyLabel,
  getMerchantDisplay,
  getMetadataDetails,
} from './transactionMetadata'
import styles from './TransactionsMobileList.module.css'
import statusBadgeStyles from './TransactionStatusBadge.module.css'
import type { CategorySelectOption } from '../categories/CategorySelect'
import type { UIEvent } from 'react'
import type { Category, Transaction } from '../../api/models'

type TransactionsMobileListProps = {
  data: Array<Transaction>
  isError: boolean
  isFetchingNextPage?: boolean
  isLoading: boolean
  onScrollNearBottom?: () => void
  totalRows: number
  variant?: 'default' | 'drilldown'
  bulkModeEnabled?: boolean
  selectedTransactionIds?: Set<string>
  onToggleTransactionSelection?: (transactionId: string) => void
}

function getCategoryLabel(transaction: Transaction) {
  const category = transaction.category
  if (!category) {
    return 'Uncategorized'
  }

  return category.detailed
}

function getTransactionCategoryColor(transaction: Transaction) {
  return (
    transaction.category?.color ?? getFallbackCategoryColor('UNCATEGORIZED')
  )
}

function getAssignableCategoryLabel(
  category: Pick<Category, 'primary' | 'detailed'>,
) {
  return category.detailed
}

function getAssignableCategoryPrimaryLabel(
  category: Pick<Category, 'primary'>,
) {
  return category.primary
}

function getAmountClass(transaction: Transaction) {
  const amount = transaction.convertedAmount ?? transaction.amount
  return amount.sign === MoneyWithSignSign.positive
    ? styles.positive
    : styles.negative
}

function hasDifferentOriginalCurrency(transaction: Transaction) {
  return (
    transaction.convertedAmount !== null &&
    transaction.convertedAmount !== undefined &&
    transaction.convertedAmount.money.currency !==
      transaction.amount.money.currency
  )
}

function formatOriginalCurrencyAmount(transaction: Transaction) {
  return `${transaction.amount.money.currency} ${formatMoneyWithSign({
    value: transaction.amount,
  })}`
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
  variant = 'default',
  bulkModeEnabled = false,
  selectedTransactionIds = new Set<string>(),
  onToggleTransactionSelection,
}: TransactionsMobileListProps) {
  const queryClient = useQueryClient()
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(
    null,
  )
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
        invalidateTransactionQueries(queryClient)
      },
    },
  })
  const categoryOptions = useMemo(
    (): Array<CategorySelectOption> =>
      categories
        .filter(isAssignableCategoryOption)
        .map((category) => ({
          value: category.id,
          primary: getAssignableCategoryPrimaryLabel(category),
          secondary: getAssignableCategoryLabel(category),
          color: category.color,
        }))
        .sort(
          (left, right) =>
            left.primary.localeCompare(right.primary) ||
            left.secondary.localeCompare(right.secondary),
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
  const drawerReadOnly = bulkModeEnabled

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
        className={`${styles.list} ${
          variant === 'drilldown' ? styles.drilldownList : ''
        }`}
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
                  aria-label={`Open transaction details for ${merchantDisplay.primary}`}
                  className={`${styles.row} ${
                    bulkModeEnabled &&
                    selectedTransactionIds.has(transaction.id)
                      ? styles.selectedRow
                      : ''
                  }`}
                  key={transaction.id}
                  onClick={() => setActiveTransactionId(transaction.id)}
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
                      {transaction.pending && (
                        <div className={styles.statusLine}>
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
                        </div>
                      )}
                      <div
                        aria-label={`${transaction.accountName ?? 'Account'} · ${getCategoryLabel(transaction)}`}
                        className={styles.metaLine}
                      >
                        <span className={styles.meta}>
                          {transaction.accountName}
                        </span>
                        <span className={styles.metaSeparator}>·</span>
                        <span
                          aria-hidden="true"
                          className={styles.categorySwatch}
                          style={getCategoryColorStyles(
                            getTransactionCategoryColor(transaction),
                          )}
                        />
                        <span className={styles.meta}>
                          {getCategoryLabel(transaction)}
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
        }}
        position="bottom"
        size="85dvh"
        title={activeMerchant?.primary ?? 'Transaction'}
      >
        {activeTransaction && activeDetails && (
          <Stack gap="md">
            <div>
              <Group justify="space-between" wrap="nowrap">
                <Text c="dimmed" size="sm">
                  {dayjs(activeTransaction.activityDate).format('MMM D, YYYY')}
                </Text>
                <Stack align="flex-end" gap={0}>
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
                  {hasDifferentOriginalCurrency(activeTransaction) && (
                    <Text c="dimmed" size="xs">
                      Original {formatOriginalCurrencyAmount(activeTransaction)}
                    </Text>
                  )}
                </Stack>
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

            {!drawerReadOnly && (
              <>
                <Stack gap={6}>
                  <TextInput
                    classNames={{ input: styles.reportingDateInput }}
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
                          updateTransaction.variables.id ===
                            activeTransaction.id
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
                  <CategorySelect
                    aria-label="Category"
                    comboboxProps={getViewportAwareComboboxProps()}
                    data={categoryOptions}
                    label="Category"
                    maxDropdownHeight={viewportAwareDropdownMaxHeight}
                    onChange={(value) =>
                      updateCategory.mutate({
                        id: activeTransaction.id,
                        data: { categoryId: value },
                      })
                    }
                    placeholder={getCategoryLabel(activeTransaction)}
                    value={activeTransaction.categoryId}
                  />
                </Stack>
              </>
            )}

            {!drawerReadOnly && <Divider />}

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
                label="Provider category"
                value={[
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
