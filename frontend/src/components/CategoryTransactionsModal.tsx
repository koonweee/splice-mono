import { Group, Loader, Modal, Text } from '@mantine/core'
import { useTransactionControllerFindAll } from '../api/clients/spliceAPI'
import { formatPrimaryCategory } from '../lib/format'
import { useIsMobile } from '../lib/hooks'
import { TransactionsTable } from './TransactionsTable'
import type { TransactionControllerFindAllAmountSign } from '../api/models'

interface CategoryTransactionsModalProps {
  opened: boolean
  onClose: () => void
  categoryPrimary: string | null
  startDate: string
  endDate: string
  flowDirection: 'inflow' | 'outflow'
}

const FLOW_SIGN: Record<
  'inflow' | 'outflow',
  TransactionControllerFindAllAmountSign
> = {
  inflow: 'positive',
  outflow: 'negative',
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

  const { data, isPending } = useTransactionControllerFindAll(
    {
      startDate,
      endDate,
      categoryPrimary: categoryPrimary ?? undefined,
      amountSign: FLOW_SIGN[flowDirection],
      pageSize: '100',
      convert: true,
    },
    { query: { enabled: opened && !!categoryPrimary } },
  )

  const transactions = data?.data ?? []
  const categoryLabel = categoryPrimary
    ? formatPrimaryCategory(categoryPrimary)
    : 'Transactions'
  const directionLabel = flowDirection === 'inflow' ? 'Inflows' : 'Outflows'

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`${categoryLabel} Transactions (${directionLabel})`}
      size={1200}
      fullScreen={isMobile}
      transitionProps={{ transition: 'fade', duration: 200 }}
    >
      {isPending ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : transactions.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          No transactions found.
        </Text>
      ) : (
        <TransactionsTable
          data={transactions}
          totalRows={transactions.length}
          isLoading={false}
          isError={false}
        />
      )}
    </Modal>
  )
}
