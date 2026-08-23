import { Box, Group, ScrollArea, Table, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import {
  HIDDEN_BALANCE_PLACEHOLDER,
  formatMoneyWithSign,
} from '../../lib/format'
import { useIsMobile } from '../../lib/hooks'
import styles from './InvestmentHoldingsTable.module.css'
import type { InvestmentActivity } from '../../api/models'

interface InvestmentActivityTableProps {
  activity: Array<InvestmentActivity>
  balancesHidden: boolean
  total?: number
}

function formatDecimal(
  value: string | null,
  maximumFractionDigits = 6,
): string {
  if (value === null) return '--'
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return value

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(numericValue)
}

function formatSubtype(activity: InvestmentActivity): string {
  return [activity.investmentType, activity.investmentSubtype]
    .filter(Boolean)
    .join(' / ')
}

function getSecurityLabel(activity: InvestmentActivity): string {
  return (
    activity.security?.tickerSymbol ?? activity.security?.name ?? activity.name
  )
}

function formatCashImpact(
  activity: InvestmentActivity,
  balancesHidden: boolean,
): string {
  if (balancesHidden) return HIDDEN_BALANCE_PLACEHOLDER
  return formatMoneyWithSign({
    value: activity.amount,
    appendCurrency: activity.amount.money.currency.length !== 3,
  })
}

export function InvestmentActivityTable({
  activity,
  balancesHidden,
  total = activity.length,
}: InvestmentActivityTableProps) {
  const isMobile = useIsMobile()
  const supportsHover = useMediaQuery(
    '(hover: hover) and (pointer: fine)',
    false,
    { getInitialValueInEffect: false },
  )

  if (activity.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No investment activity found.
      </Text>
    )
  }

  if (isMobile) {
    return (
      <Box
        aria-label={`Investment activity list, ${activity.length} of ${total} shown`}
      >
        {activity.map((row) => (
          <Box key={row.id} className={styles.mobileRow} px="xs" py="sm">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Box style={{ minWidth: 0 }}>
                <Text fw={600} size="sm" truncate>
                  {getSecurityLabel(row)}
                </Text>
                <Text c="dimmed" size="xs">
                  {row.activityDate} · {formatSubtype(row)}
                </Text>
                <Text c="dimmed" size="xs">
                  {formatDecimal(row.quantity)} @ {formatDecimal(row.price, 4)}
                </Text>
              </Box>
              <Text fw={600} size="sm" ta="right" style={{ flexShrink: 0 }}>
                {formatCashImpact(row, balancesHidden)}
              </Text>
            </Group>
          </Box>
        ))}
      </Box>
    )
  }

  return (
    <ScrollArea type="auto">
      <Table
        className={styles.table}
        striped
        highlightOnHover={supportsHover}
        verticalSpacing="xs"
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th>Security</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th ta="right">Quantity</Table.Th>
            <Table.Th ta="right">Price</Table.Th>
            <Table.Th ta="right">Fees</Table.Th>
            <Table.Th ta="right">Cash impact</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {activity.map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td>{row.activityDate}</Table.Td>
              <Table.Td className={styles.securityCell}>
                <Text size="sm" truncate>
                  {getSecurityLabel(row)}
                </Text>
              </Table.Td>
              <Table.Td>{formatSubtype(row)}</Table.Td>
              <Table.Td ta="right">{formatDecimal(row.quantity)}</Table.Td>
              <Table.Td ta="right">{formatDecimal(row.price, 4)}</Table.Td>
              <Table.Td ta="right">{formatDecimal(row.fees, 4)}</Table.Td>
              <Table.Td ta="right">
                {formatCashImpact(row, balancesHidden)}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  )
}
