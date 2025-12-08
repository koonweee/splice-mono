import { Box, Paper, Text, Title } from '@mantine/core'
import type {
  MoneyWithSign,
  NetWorthChartPoint,
  TimePeriod,
} from '../api/models'
import { formatMoneyWithSign, formatPercent } from '../lib/format'
import { MoneyChart } from './MoneyChart'

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
  chartData,
}: {
  netWorth: MoneyWithSign
  changePercent: number | null
  comparisonPeriod: TimePeriod
  chartData?: NetWorthChartPoint[]
}) {
  const hasChartData = chartData && chartData.length > 0

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
      {hasChartData && (
        <Box mt="md">
          <MoneyChart data={chartData} height={200} />
        </Box>
      )}
    </Paper>
  )
}
