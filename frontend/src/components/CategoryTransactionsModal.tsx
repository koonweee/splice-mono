import { Group, Loader, Modal, Text } from '@mantine/core'
import {
  useTransactionAnalysisControllerGetBalanceAdjustments,
  useTransactionAnalysisControllerGetTransactions,
} from '../api/clients/spliceAPI'
import { formatPrimaryCategory } from '../lib/format'
import { useIsMobile } from '../lib/hooks'
import { BalanceAdjustmentsTable } from './BalanceAdjustmentsTable'
import { TransactionsTable } from './TransactionsTable'

interface CategoryTransactionsModalProps {
  opened: boolean
  onClose: () => void
  categoryPrimary: string | null
  startDate: string
  endDate: string
  flowDirection: 'inflow' | 'outflow'
}

export function CategoryTransactionsModal({
  opened,
  onClose,
  categoryPrimary,
  startDate,
  endDate,
  flowDirection,
}: CategoryTransactionsModalProps) {
  const isMobile = useIsMobile()
  const isBalanceAdjustment = categoryPrimary === 'BALANCE_ADJUSTMENT'
  const directionLabel = flowDirection === 'inflow' ? 'Inflows' : 'Outflows'
  const title = isBalanceAdjustment
    ? `Balance Adjustments (${directionLabel})`
    : `${categoryPrimary ? formatPrimaryCategory(categoryPrimary) : 'Transactions'} Transactions (${directionLabel})`

  function TransactionsDrilldown() {
    const { data, isPending } = useTransactionAnalysisControllerGetTransactions(
      {
        startDate,
        endDate,
        categoryPrimary: categoryPrimary ?? '',
        flowDirection,
      },
      { query: { enabled: opened && !!categoryPrimary } },
    )

    const transactions = data ?? []

    if (isPending) {
      return (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      )
    }

    if (transactions.length === 0) {
      return (
        <Text c="dimmed" ta="center" py="xl">
          No transactions found.
        </Text>
      )
    }

    return (
      <TransactionsTable
        data={transactions}
        totalRows={transactions.length}
        isLoading={false}
        isError={false}
      />
    )
  }

  function BalanceAdjustmentsDrilldown() {
    const { data, isPending } =
      useTransactionAnalysisControllerGetBalanceAdjustments(
        {
          startDate,
          endDate,
          categoryPrimary: 'BALANCE_ADJUSTMENT',
          flowDirection,
        },
        { query: { enabled: opened && isBalanceAdjustment } },
      )

    const balanceAdjustments = data ?? []

    if (isPending) {
      return (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      )
    }

    if (balanceAdjustments.length === 0) {
      return (
        <Text c="dimmed" ta="center" py="xl">
          No transactions found.
        </Text>
      )
    }

    return <BalanceAdjustmentsTable data={balanceAdjustments} />
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size={1200}
      fullScreen={isMobile}
      transitionProps={{ transition: 'fade', duration: 200 }}
    >
      {isBalanceAdjustment ? (
        <BalanceAdjustmentsDrilldown />
      ) : (
        <TransactionsDrilldown />
      )}
    </Modal>
  )
}
