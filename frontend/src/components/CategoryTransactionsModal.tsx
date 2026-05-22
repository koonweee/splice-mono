import { Box, Group, Loader, Modal, Text } from '@mantine/core'
import { useTransactionAnalysisControllerGetTransactions } from '../api/clients/spliceAPI'
import { formatPrimaryCategory } from '../lib/format'
import { useIsMobile } from '../lib/hooks'
import { TransactionsTable } from './TransactionsTable'
import { TransactionsMobileList } from './transactions/TransactionsMobileList'
import styles from './CategoryTransactionsModal.module.css'

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
  const directionLabel = flowDirection === 'inflow' ? 'Inflows' : 'Outflows'
  const title = `${categoryPrimary ? formatPrimaryCategory(categoryPrimary) : 'Transactions'} Transactions (${directionLabel})`

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

    return isMobile ? (
      <TransactionsMobileList
        data={transactions}
        totalRows={transactions.length}
        isLoading={false}
        isError={false}
        variant="drilldown"
      />
    ) : (
      <TransactionsTable
        data={transactions}
        totalRows={transactions.length}
        isLoading={false}
        isError={false}
        mantinePaperProps={{ className: styles.drilldownTablePaper }}
        mantineTableContainerProps={{
          className: styles.drilldownTableContainer,
        }}
      />
    )
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size={1200}
      fullScreen={isMobile}
      classNames={{
        body: styles.drilldownModalBody,
        content: styles.drilldownModalContent,
      }}
      transitionProps={{ transition: 'fade', duration: 200 }}
    >
      <Box className={styles.drilldownBody}>
        <TransactionsDrilldown />
      </Box>
    </Modal>
  )
}
