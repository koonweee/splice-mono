import { AreaChart } from '@mantine/charts'
import { Paper, Text } from '@mantine/core'
import dayjs from 'dayjs'
import type { NetWorthChartPoint } from '../api/models'
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

interface MoneyChartProps {
  data: NetWorthChartPoint[]
  height?: number
  color?: string
  mb?: string
}

export function MoneyChart({
  data,
  height = 280,
  color = 'teal.6',
  mb,
}: MoneyChartProps) {
  // Transform data for Mantine chart - convert cents to dollars with proper sign
  // Filter out null values and transform the rest
  const chartData = data
    .filter((point) => point.value !== null)
    .map((point) => {
      const value = point.value!
      const dollars = value.money.amount / 100
      const signedValue =
        value.sign === MoneyWithSignSign.negative ? -dollars : dollars

      return {
        date: formatDate(point.date),
        value: signedValue,
      }
    })

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)

  return (
    <AreaChart
      h={height}
      mb={mb}
      data={chartData}
      dataKey="date"
      series={[{ name: 'value', color }]}
      curveType="natural"
      withDots
      gridAxis="xy"
      withXAxis
      withYAxis
      withGradient
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

function formatDate(dateStr: string): string {
  return dayjs(dateStr).format('MMM D')
}
