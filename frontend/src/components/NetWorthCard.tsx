import { TIME_PERIOD_LABELS, TimePeriod } from '@/lib/types'
import { Box, Paper, Text, Title } from '@mantine/core'
import { useState } from 'react'
import type { MoneyWithSign } from '../api/models'
import {
  formatMoneyNumber,
  formatMoneyWithSign,
  formatPercent,
  getChangeColorMantine,
} from '../lib/format'
import { Chart, type ChartDataPoint } from './Chart'

export function NetWorthCard({
  netWorth,
  changePercent,
  comparisonPeriod,
  chartData,
}: {
  netWorth: MoneyWithSign
  changePercent?: number
  comparisonPeriod: TimePeriod
  chartData?: ChartDataPoint[]
}) {
  const hasChartData = chartData && chartData.length > 0
  const [hoveredPoint, setHoveredPoint] = useState<ChartDataPoint | undefined>(
    undefined,
  )

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
        {!hoveredPoint &&
          changePercent !== undefined &&
          changePercent !== 0 && (
            <Text size="sm" c={getChangeColorMantine(false, changePercent)}>
              {formatPercent(changePercent)} from last{' '}
              {TIME_PERIOD_LABELS[comparisonPeriod].toLowerCase()}
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
