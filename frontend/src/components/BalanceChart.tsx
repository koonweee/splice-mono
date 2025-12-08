import { AreaChart } from '@mantine/charts'
import { Paper, Text } from '@mantine/core'
import dayjs from 'dayjs'
import type { BalanceSnapshotWithConvertedBalance } from '../api/models'
import { MoneyWithSignSign } from '../api/models'

function ChartTooltip({ label, value }: { label: string; value: string }) {
  return (
    <Paper px="md" py="xs" withBorder shadow="md" radius="md">
      <Text size="xs" c="dimmed" mb={4}>
        {label}
      </Text>
      <Text fw={600} size="lg">
        {value}
      </Text>
    </Paper>
  )
}

interface BalanceChartProps {
  data: BalanceSnapshotWithConvertedBalance[]
  height?: number
  color?: string
}

export function BalanceChart({
  data,
  height = 280,
  color = 'blue.6',
}: BalanceChartProps) {
  // Sort by date and transform for chart
  const chartData = [...data]
    .sort(
      (a, b) =>
        new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime(),
    )
    .map((snapshot) => {
      const balance =
        snapshot.convertedCurrentBalance?.balance ?? snapshot.currentBalance
      const dollars = balance.money.amount / 100
      const signedValue =
        balance.sign === MoneyWithSignSign.negative ? -dollars : dollars

      return {
        date: dayjs(snapshot.snapshotDate).format('MMM D'),
        value: signedValue,
      }
    })

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value)

  if (chartData.length === 0) {
    return null
  }

  return (
    <AreaChart
      h={height}
      data={chartData}
      dataKey="date"
      series={[{ name: 'value', color }]}
      curveType="monotone"
      withDots
      gridAxis="xy"
      withXAxis
      withYAxis
      withGradient
      xAxisProps={{ tickLine: true, interval: 0 }}
      yAxisProps={{ width: 80, domain: ['auto', 'auto'] }}
      valueFormatter={formatCurrency}
      tooltipProps={{
        content: ({ label, payload }) => {
          if (!payload?.length || !label) return null
          const value = payload[0]?.value as number
          return (
            <ChartTooltip label={String(label)} value={formatCurrency(value)} />
          )
        },
      }}
    />
  )
}
