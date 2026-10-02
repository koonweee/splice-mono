import { Button, Skeleton, Stack, Text, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'
import { FormActions } from '../forms/FormActions'
import { formatInvestmentValue } from '../../lib/investment-format'
import styles from './ManualBrokeragePositionsEditor.module.css'
import type { InvestmentHoldingSnapshot } from '../../api/models'

export function ManualBrokerageHoldingsModalSkeleton({
  holdings = [],
}: {
  holdings?: Array<InvestmentHoldingSnapshot>
}) {
  return (
    <form inert onSubmit={(event) => event.preventDefault()}>
      <Stack>
        <Stack gap="sm">
          <div>
            <Text data-typography="label" mb={4}>
              Positions
            </Text>
            <TextInput
              aria-label="Search stocks and ETFs"
              leftSection={<Search size={14} />}
              disabled
              size="md"
              placeholder="Search AAPL or C6L.SI"
            />
          </div>
          <Stack gap="xs">
            <Text data-typography="caption" c="dimmed">
              Average cost per share is optional, in each security’s currency.
              Update it when your holdings change.
            </Text>
            {holdings.map((holding) => (
              <div className={styles.positionRow} key={holding.id}>
                <div className={styles.positionDetails}>
                  <Text data-typography="rowTitleSmall" truncate>
                    {holding.security.tickerSymbol ??
                      holding.security.externalSecurityId}
                    {holding.security.name ? ` · ${holding.security.name}` : ''}
                  </Text>
                  <Text data-typography="caption" c="dimmed" truncate>
                    {holding.security.marketIdentifierCode ??
                      'Unknown exchange'}{' '}
                    ·{' '}
                    {holding.isoCurrencyCode ??
                      holding.security.isoCurrencyCode ??
                      'USD'}
                  </Text>
                </div>
                <TextInput
                  label="Shares"
                  className={styles.quantityInput}
                  size="md"
                  disabled
                />
                <TextInput
                  label={`Avg. cost per share (${holding.isoCurrencyCode ?? holding.security.isoCurrencyCode ?? 'USD'})`}
                  className={styles.costBasisInput}
                  size="md"
                  inputWrapperOrder={['label', 'input', 'description', 'error']}
                  description={
                    <Text component="span" data-typography="caption" c="dimmed">
                      Total cost basis:{' '}
                      {formatInvestmentValue({
                        value: holding.costBasis,
                        currency:
                          holding.isoCurrencyCode ??
                          holding.security.isoCurrencyCode ??
                          'USD',
                        showCurrencyCode: true,
                      })}
                    </Text>
                  }
                  disabled
                />
                <Skeleton
                  className={styles.removePosition}
                  height="var(--splice-size-touch-target)"
                  width="var(--splice-size-touch-target)"
                />
              </div>
            ))}
          </Stack>
        </Stack>
        <FormActions onCancel={() => {}} cancelDisabled>
          <Button disabled>Save holdings</Button>
        </FormActions>
      </Stack>
    </form>
  )
}
