import { Box, Group, ScrollArea, Table, Text } from '@mantine/core'
import {
  HIDDEN_BALANCE_PLACEHOLDER,
  formatCalendarDate,
  formatMoneyWithSign,
} from '../../lib/format'
import {
  formatInvestmentQuantity,
  formatInvestmentQuote,
  formatInvestmentValue,
} from '../../lib/investment-format'
import { useDataListLayout, useSupportsHover } from '../../lib/responsive'
import styles from './InvestmentHoldingsTable.module.css'
import type { InvestmentActivity } from '../../api/models'

interface InvestmentActivityTableProps {
  activity: Array<InvestmentActivity>
  balancesHidden: boolean
  total?: number
}

function formatSubtype(activity: InvestmentActivity): string {
  const type = activity.investmentType.trim()
  const subtype = activity.investmentSubtype.trim()
  const labels =
    subtype && (type === 'cash' || subtype === type)
      ? [subtype]
      : [type, subtype]

  return (
    labels
      .filter((label): label is string => !!label)
      .map((label) => {
        const words = label.replace(/[_-]+/g, ' ')
        return words.charAt(0).toUpperCase() + words.slice(1)
      })
      .join(' · ') || 'Activity'
  )
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
  const isMobile = useDataListLayout()
  const supportsHover = useSupportsHover()

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
                  {formatCalendarDate(row.activityDate)} · {formatSubtype(row)}
                </Text>
                <Text c="dimmed" size="xs">
                  {formatInvestmentQuantity(row.quantity)} @{' '}
                  {formatInvestmentQuote({
                    value: row.price,
                    currency: row.amount.money.currency,
                  })}
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
              <Table.Td>{formatCalendarDate(row.activityDate)}</Table.Td>
              <Table.Td className={styles.securityCell}>
                <Text size="sm" truncate>
                  {getSecurityLabel(row)}
                </Text>
              </Table.Td>
              <Table.Td>{formatSubtype(row)}</Table.Td>
              <Table.Td ta="right">
                {formatInvestmentQuantity(row.quantity)}
              </Table.Td>
              <Table.Td ta="right">
                {formatInvestmentQuote({
                  value: row.price,
                  currency: row.amount.money.currency,
                })}
              </Table.Td>
              <Table.Td ta="right">
                {formatInvestmentValue({
                  value: row.fees,
                  currency: row.amount.money.currency,
                  preserveFractionalPrecision: true,
                })}
              </Table.Td>
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
