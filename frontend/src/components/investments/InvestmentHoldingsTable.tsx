import { Box, Group, ScrollArea, Table, Text } from '@mantine/core'
import { ResponsiveSlot } from '../ResponsiveSlot'
import { HIDDEN_BALANCE_PLACEHOLDER, formatDateTime } from '../../lib/format'
import {
  formatInvestmentQuantity,
  formatInvestmentQuote,
  formatInvestmentValue,
} from '../../lib/investment-format'
import { useDataListLayout, useSupportsHover } from '../../lib/responsive'
import styles from './InvestmentHoldingsTable.module.css'
import type { InvestmentHoldingSnapshot } from '../../api/models'

interface InvestmentHoldingsTableProps {
  holdings: Array<InvestmentHoldingSnapshot>
  balancesHidden: boolean
  accountCurrency?: string | null
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

function getQuoteAsOf(holding: InvestmentHoldingSnapshot): string | null {
  return (
    holding.institutionPriceDatetime ??
    holding.institutionPriceAsOf ??
    holding.security.updateDatetime ??
    holding.security.closePriceAsOf ??
    null
  )
}

function shouldShowNormalizedValue(
  holding: InvestmentHoldingSnapshot,
  nativeCurrency: string,
  responseAccountCurrency?: string | null,
): boolean {
  const accountCurrency = holding.accountCurrency ?? responseAccountCurrency
  return (
    holding.accountValue !== null &&
    !!accountCurrency &&
    accountCurrency !== nativeCurrency
  )
}

export function InvestmentHoldingsTable({
  holdings,
  balancesHidden,
  accountCurrency,
}: InvestmentHoldingsTableProps) {
  const isMobile = useDataListLayout()
  const supportsHover = useSupportsHover()

  if (holdings.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No holdings found.
      </Text>
    )
  }

  const compactRows = (
    <Box aria-label={`Investment holdings list, ${holdings.length} total`}>
      {holdings.map((holding) => {
        const currency = getHoldingCurrency(holding)
        const normalizedCurrency = holding.accountCurrency ?? accountCurrency
        const showNormalized = shouldShowNormalizedValue(
          holding,
          currency,
          accountCurrency,
        )
        const quoteAsOf = getQuoteAsOf(holding)
        return (
          <Box key={holding.id} className={styles.mobileRow} px="xs" py="sm">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Box style={{ minWidth: 0 }}>
                <Text fw={600} size="sm" truncate>
                  {getSecurityLabel(holding)}
                </Text>
                <Text c="dimmed" size="xs">
                  {getTickerLabel(holding)} ·{' '}
                  {formatInvestmentQuantity(holding.quantity)}
                </Text>
                <Text c="dimmed" size="xs">
                  {balancesHidden
                    ? HIDDEN_BALANCE_PLACEHOLDER
                    : formatInvestmentQuote({
                        value: holding.institutionPrice,
                        currency,
                        showCurrencyCode: showNormalized,
                      })}
                </Text>
                {quoteAsOf && (
                  <Text c="dimmed" size="xs">
                    Price as of {formatDateTime(quoteAsOf)}
                  </Text>
                )}
              </Box>
              <Box ta="right" style={{ flexShrink: 0 }}>
                <Text fw={600} size="sm">
                  {balancesHidden
                    ? HIDDEN_BALANCE_PLACEHOLDER
                    : formatInvestmentValue({
                        value: holding.institutionValue,
                        currency,
                        showCurrencyCode: showNormalized,
                      })}
                </Text>
                {showNormalized && normalizedCurrency && (
                  <Text c="dimmed" size="xs">
                    {balancesHidden
                      ? HIDDEN_BALANCE_PLACEHOLDER
                      : formatInvestmentValue({
                          value: holding.accountValue,
                          currency: normalizedCurrency,
                        })}
                  </Text>
                )}
              </Box>
            </Group>
          </Box>
        )
      })}
    </Box>
  )

  return (
    <>
      <ResponsiveSlot
        compact={isMobile}
        variant="compact"
        breakpoint="data-list"
      >
        {compactRows}
      </ResponsiveSlot>
      <ResponsiveSlot compact={isMobile} variant="wide" breakpoint="data-list">
        <ScrollArea type="auto">
          <Table
            className={styles.table}
            striped
            highlightOnHover={supportsHover}
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
                const showNormalized = shouldShowNormalizedValue(
                  holding,
                  currency,
                  accountCurrency,
                )
                const quoteAsOf = getQuoteAsOf(holding)
                return (
                  <Table.Tr key={holding.id}>
                    <Table.Td className={styles.securityCell}>
                      <Text size="sm" truncate>
                        {getSecurityLabel(holding)}
                      </Text>
                      {(holding.security.marketIdentifierCode || quoteAsOf) && (
                        <Text c="dimmed" size="xs">
                          {holding.security.marketIdentifierCode
                            ? `${holding.security.marketIdentifierCode}${quoteAsOf ? ' · ' : ''}`
                            : ''}
                          {quoteAsOf
                            ? `Price as of ${formatDateTime(quoteAsOf)}`
                            : ''}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{getTickerLabel(holding)}</Table.Td>
                    <Table.Td ta="right">
                      {formatInvestmentQuantity(holding.quantity)}
                    </Table.Td>
                    <Table.Td ta="right">
                      {balancesHidden
                        ? HIDDEN_BALANCE_PLACEHOLDER
                        : formatInvestmentQuote({
                            value: holding.institutionPrice,
                            currency,
                            showCurrencyCode: showNormalized,
                          })}
                    </Table.Td>
                    <Table.Td ta="right">
                      {balancesHidden
                        ? HIDDEN_BALANCE_PLACEHOLDER
                        : formatInvestmentValue({
                            value: holding.institutionValue,
                            currency,
                            showCurrencyCode: showNormalized,
                          })}
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </ResponsiveSlot>
    </>
  )
}
