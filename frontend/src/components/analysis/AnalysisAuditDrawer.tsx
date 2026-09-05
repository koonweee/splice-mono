import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
} from '@mantine/core'
import { ClipboardList } from 'lucide-react'
import { useMemo } from 'react'
import { useCompactLayout } from '../../lib/responsive'
import {
  formatCategoryName,
  formatDateTime,
  formatMoneyNumber,
  formatPrimaryCategory,
  getDecimalPlaces,
} from '../../lib/format'
import { formatDateRangeLabel } from '../../lib/date-range'
import type {
  AnalysisAuditTransaction,
  TransactionAnalysisAuditResponse,
  TransactionAnalysisAuditResponseRowsItem,
} from '../../api/models'

export type AnalysisAuditDrawerQuery = {
  data?: TransactionAnalysisAuditResponse
  isLoading?: boolean
  isPending?: boolean
  isError?: boolean
}

type AuditGroup = {
  key: string
  label: string
  rows: Array<TransactionAnalysisAuditResponseRowsItem>
}

type AnalysisAuditDrawerProps = {
  opened: boolean
  onClose: () => void
  startDate: string
  endDate: string
  auditQuery?: AnalysisAuditDrawerQuery
}

function toMajorUnits(amount: number, currency: string) {
  return amount / Math.pow(10, getDecimalPlaces(currency))
}

function formatAuditAmount(transaction: AnalysisAuditTransaction) {
  const signedAmount =
    transaction.amount.sign === 'negative'
      ? -Math.abs(transaction.amount.amount)
      : Math.abs(transaction.amount.amount)

  return formatMoneyNumber({
    value: toMajorUnits(signedAmount, transaction.amount.currency),
    currency: transaction.amount.currency,
  })
}

function getTransactionTitle(transaction: AnalysisAuditTransaction) {
  return (
    transaction.merchantName?.trim() ||
    transaction.originalDescription?.trim() ||
    'Transaction'
  )
}

function TransactionSummary({
  label,
  transaction,
}: {
  label?: string
  transaction: AnalysisAuditTransaction
}) {
  const primary = formatPrimaryCategory(transaction.categoryPrimary)
  const detailed = transaction.categoryDetailed
    ? formatCategoryName({
        primary: transaction.categoryPrimary,
        detailed: transaction.categoryDetailed,
      })
    : null

  return (
    <Box style={{ minWidth: 0 }}>
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          {label && (
            <Badge size="sm" variant="light">
              {label}
            </Badge>
          )}
          <Text fw={600} size="sm" truncate>
            {getTransactionTitle(transaction)}
          </Text>
        </Group>
        <Text fw={700} size="sm" style={{ flexShrink: 0 }}>
          {formatAuditAmount(transaction)}
        </Text>
      </Group>
      <Text c="dimmed" size="xs" mt={4}>
        {formatDateTime(transaction.activityDate)} · {transaction.accountName}
      </Text>
      <Text c="dimmed" size="xs">
        {primary}
        {detailed && detailed !== primary ? ` · ${detailed}` : ''}
      </Text>
    </Box>
  )
}

function AuditRowCard({
  row,
}: {
  row: TransactionAnalysisAuditResponseRowsItem
}) {
  if (row.type === 'excluded') {
    return (
      <Paper withBorder p="sm" radius="sm">
        <TransactionSummary transaction={row.transaction} />
      </Paper>
    )
  }

  return (
    <Paper withBorder p="sm" radius="sm">
      <Stack gap="xs">
        <TransactionSummary label="Outflow" transaction={row.outflow} />
        <Divider />
        <TransactionSummary label="Inflow" transaction={row.inflow} />
      </Stack>
    </Paper>
  )
}

function groupAuditRows(
  rows: Array<TransactionAnalysisAuditResponseRowsItem>,
): Array<AuditGroup> {
  const groupsByKey = new Map<string, AuditGroup>()

  rows.forEach((row) => {
    const group = groupsByKey.get(row.groupKey)
    if (group) {
      group.rows.push(row)
      return
    }

    groupsByKey.set(row.groupKey, {
      key: row.groupKey,
      label: row.groupLabel,
      rows: [row],
    })
  })

  return Array.from(groupsByKey.values())
}

export function AnalysisAuditDrawer({
  opened,
  onClose,
  startDate,
  endDate,
  auditQuery,
}: AnalysisAuditDrawerProps) {
  const isMobile = useCompactLayout()
  const isLoading = Boolean(auditQuery?.isPending ?? auditQuery?.isLoading)
  const isError = Boolean(auditQuery?.isError)
  const rows = auditQuery?.data?.rows ?? []
  const groups = useMemo(() => groupAuditRows(rows), [rows])

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Analysis audit"
      position={isMobile ? 'bottom' : 'right'}
      size={isMobile ? 'min(92dvh, 720px)' : 560}
      padding="md"
      styles={{
        content: { display: 'flex', flexDirection: 'column' },
        body: {
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        },
      }}
    >
      <Stack gap="md" h="100%" style={{ minHeight: 0 }}>
        <Group justify="space-between" align="flex-start" gap="sm">
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" c="dimmed">
              {formatDateRangeLabel([startDate, endDate])}
            </Text>
            {auditQuery?.data && (
              <Text size="xs" c="dimmed">
                Refund matching window:{' '}
                {auditQuery.data.neutralizationLookaroundDays} days
              </Text>
            )}
          </Box>
          <Button
            component="a"
            href="/settings?tab=analysis"
            variant="light"
            leftSection={<ClipboardList size={16} />}
            size={isMobile ? 'md' : 'sm'}
          >
            Manage rules
          </Button>
        </Group>

        {isLoading && (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        )}

        {isError && (
          <Alert color="red" title="Error">
            Failed to load analysis audit.
          </Alert>
        )}

        {!isLoading && !isError && groups.length === 0 && (
          <Paper withBorder p="lg" radius="md">
            <Stack gap="sm" align="flex-start">
              <Text c="dimmed">No rule effects for this date range.</Text>
              <Button
                component="a"
                href="/settings?tab=analysis"
                variant="light"
                size={isMobile ? 'md' : 'sm'}
              >
                Manage rules
              </Button>
            </Stack>
          </Paper>
        )}

        {!isLoading && !isError && groups.length > 0 && (
          <Stack
            gap="lg"
            style={{
              overflowY: 'auto',
              minHeight: 0,
              flex: '1 1 auto',
            }}
          >
            {groups.map((group) => (
              <Stack gap="xs" key={group.key}>
                <Group justify="space-between" gap="sm">
                  <Text fw={700}>{group.label}</Text>
                  <Badge variant="light">{group.rows.length}</Badge>
                </Group>
                <Stack gap="xs">
                  {group.rows.map((row) => (
                    <AuditRowCard key={row.id} row={row} />
                  ))}
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
    </Drawer>
  )
}
