import { Box, Group, ScrollArea, Table, Text } from '@mantine/core'
import { HIDDEN_BALANCE_PLACEHOLDER, formatMoneyNumber } from '../../lib/format'
import { useIsMobile } from '../../lib/hooks'
import styles from './InvestmentHoldingsTable.module.css'
import type { InvestmentHoldingSnapshot } from '../../api/models'

interface InvestmentHoldingsTableProps {
  holdings: Array<InvestmentHoldingSnapshot>
  balancesHidden: boolean
}

function getHoldingCurrency(holding: InvestmentHoldingSnapshot): string {
  return (
    holding.isoCurrencyCode ??
    holding.security.isoCurrencyCode ??
    holding.unofficialCurrencyCode ??
    holding.security.unofficialCurrencyCode ??
    'USD'
  )
}

function formatDecimal(value: string | null, maximumFractionDigits = 6): string {
  if (value === null) return '--'
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return value

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(numericValue)
}

function formatMoneyValue(
  value: string | null,
  currency: string,
  balancesHidden: boolean,
): string {
  if (balancesHidden) return HIDDEN_BALANCE_PLACEHOLDER
  if (value === null) return '--'
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return value

  return formatMoneyNumber({
    value: numericValue,
    currency,
    decimals: 2,
    appendCurrency: currency.length !== 3,
  })
}

function getSecurityLabel(holding: InvestmentHoldingSnapshot): string {
  return (
    holding.security.name ??
    holding.security.tickerSymbol ??
    holding.security.type ??
    'Unknown security'
  )
}

function getTickerLabel(holding: InvestmentHoldingSnapshot): string {
  return holding.security.tickerSymbol ?? '--'
}

export function InvestmentHoldingsTable({
  holdings,
  balancesHidden,
}: InvestmentHoldingsTableProps) {
  const isMobile = useIsMobile()

  if (holdings.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No holdings found.
      </Text>
    )
  }

  if (isMobile) {
    return (
      <Box aria-label={`Investment holdings list, ${holdings.length} total`}>
        {holdings.map((holding) => {
          const currency = getHoldingCurrency(holding)
          return (
            <Box
              key={holding.id}
              className={styles.mobileRow}
              px="xs"
              py="sm"
            >
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Box style={{ minWidth: 0 }}>
                  <Text fw={600} size="sm" truncate>
                    {getSecurityLabel(holding)}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {getTickerLabel(holding)} · {formatDecimal(holding.quantity)}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {formatMoneyValue(
                      holding.institutionPrice,
                      currency,
                      balancesHidden,
                    )}
                  </Text>
                </Box>
                <Text fw={600} size="sm" ta="right" style={{ flexShrink: 0 }}>
                  {formatMoneyValue(
                    holding.institutionValue,
                    currency,
                    balancesHidden,
                  )}
                </Text>
              </Group>
            </Box>
          )
        })}
      </Box>
    )
  }

  return (
    <ScrollArea type="auto">
      <Table
        className={styles.table}
        striped
        highlightOnHover
        verticalSpacing="xs"
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Security</Table.Th>
            <Table.Th>Ticker</Table.Th>
            <Table.Th ta="right">Quantity</Table.Th>
            <Table.Th ta="right">Price</Table.Th>
            <Table.Th ta="right">Value</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {holdings.map((holding) => {
            const currency = getHoldingCurrency(holding)
            return (
              <Table.Tr key={holding.id}>
                <Table.Td className={styles.securityCell}>
                  <Text size="sm" truncate>
                    {getSecurityLabel(holding)}
                  </Text>
                </Table.Td>
                <Table.Td>{getTickerLabel(holding)}</Table.Td>
                <Table.Td ta="right">
                  {formatDecimal(holding.quantity)}
                </Table.Td>
                <Table.Td ta="right">
                  {formatMoneyValue(
                    holding.institutionPrice,
                    currency,
                    balancesHidden,
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  {formatMoneyValue(
                    holding.institutionValue,
                    currency,
                    balancesHidden,
                  )}
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  )
}
