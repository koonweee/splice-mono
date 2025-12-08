import { AreaChart } from '@mantine/charts'
import type { NetWorthChartPoint } from '../api/models'
import { MoneyWithSignSign } from '../api/models'

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
      yAxisProps={{ width: 80 }}
      valueFormatter={(value) =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(value)
      }
    />
  )
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
