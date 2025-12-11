import { Box, Paper, Text, Title } from '@mantine/core'
import { useState } from 'react'
import type { MoneyWithSign, TimePeriod } from '../api/models'
import { formatMoneyNumber, formatMoneyWithSign, formatPercent } from '../lib/format'
import { Chart, type ChartDataPoint } from './Chart'

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
  chartData?: ChartDataPoint[]
}) {
  const hasChartData = chartData && chartData.length > 0
  const [hoveredPoint, setHoveredPoint] = useState<ChartDataPoint | null>(null)

  const displayValue = hoveredPoint
    ? formatMoneyNumber({ value: hoveredPoint.value })
    : formatMoneyWithSign({ value: netWorth })

  const displayLabel = ['Net worth', hoveredPoint?.label]
    .filter(Boolean)
    .join(' - ')

  return (
    <Paper mb="xl">
      <Box>
        <Text size="sm" c="dimmed" mb={4}>
          {displayLabel}
        </Text>
        <Title order={2} size="h1">
          {displayValue}
        </Title>
        {!hoveredPoint && changePercent !== null && changePercent !== 0 && (
          <Text size="sm" c={getChangeColorMantine(changePercent)}>
            {formatPercent(changePercent)} from last{' '}
            {PERIOD_LABELS[comparisonPeriod].toLowerCase()}
          </Text>
        )}
      </Box>
      {hasChartData && (
        <Box mt="md">
          <Chart
            data={chartData}
            height={200}
            valueFormatter={(value) =>
              formatMoneyNumber({ value, decimals: 0 })
            }
            onDataPointHover={setHoveredPoint}
          />
        </Box>
      )}
    </Paper>
  )
}
