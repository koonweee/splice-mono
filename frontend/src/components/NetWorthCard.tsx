import { Paper, Text, Title } from '@mantine/core'
import type { MoneyWithSign, TimePeriod } from '../api/models'
import { formatMoneyWithSign, formatPercent } from '../lib/format'

const PERIOD_LABELS: Record<TimePeriod, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
}

function getChangeColorMantine(changePercent: number | null): string {
  if (changePercent === null) return 'dimmed'
  return changePercent > 0 ? 'teal' : 'red'
}

export function NetWorthCard({
  netWorth,
  changePercent,
  comparisonPeriod,
}: {
  netWorth: MoneyWithSign
  changePercent: number | null
  comparisonPeriod: TimePeriod
}) {
  return (
    <Paper p="lg" withBorder mb="xl">
      <Text size="sm" c="dimmed" mb={4}>
        Net Worth
      </Text>
      <Title order={2} size="h1">
        {formatMoneyWithSign(netWorth)}
      </Title>
      {changePercent !== null && changePercent !== 0 && (
        <Text size="sm" c={getChangeColorMantine(changePercent)}>
          {formatPercent(changePercent)} from last{' '}
          {PERIOD_LABELS[comparisonPeriod].toLowerCase()}
        </Text>
      )}
    </Paper>
  )
}
