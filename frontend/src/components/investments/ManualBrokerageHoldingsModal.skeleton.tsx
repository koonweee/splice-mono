import { Button, Skeleton, Stack, Text, TextInput } from '@mantine/core'
import { Search } from 'lucide-react'
import { FormActions } from '../forms/FormActions'
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
            />
          </div>
          <Stack gap="xs">
            <div className={styles.positionHeader}>
              <Text data-typography="caption">Stock</Text>
              <Text data-typography="caption">Shares</Text>
              <span />
            </div>
            {holdings.map((holding) => (
              <div className={styles.positionRow} key={holding.id}>
                <div className={styles.positionDetails}>
                  <Text data-typography="rowTitleSmall">
                    {holding.security.tickerSymbol}
                  </Text>
                  <Skeleton height={14} width="75%" />
                </div>
                <TextInput disabled />
                <Skeleton height={34} width={34} />
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
