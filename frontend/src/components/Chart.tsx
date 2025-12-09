import { AreaChart } from '@mantine/charts'
import { Paper, Text } from '@mantine/core'

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

export interface ChartDataPoint {
  label: string
  value: number
}

interface ChartProps {
  data: ChartDataPoint[]
  valueFormatter: (value: number) => string
  height?: number
  color?: string
  mb?: string
}

export function Chart({
  data,
  valueFormatter,
  height = 280,
  color = 'teal.6',
  mb,
}: ChartProps) {
  if (data.length === 0) {
    return null
  }

  // Calculate min and max for y-axis ticks with padding for label visibility
  const values = data.map((d) => d.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue || 1 // Avoid division by zero
  const padding = range * 0.1 // 10% padding
  const domainMin = minValue - padding
  const domainMax = maxValue + padding

  return (
    <AreaChart
      h={height}
      mb={mb}
      data={data}
      dataKey="label"
      series={[{ name: 'value', color }]}
      curveType="monotone"
      withDots
      gridAxis="none"
      withXAxis={false}
      withGradient
      yAxisProps={{
        domain: [domainMin, domainMax],
        ticks: [minValue, maxValue],
        interval: 0,
      }}
      referenceLines={[
        { y: minValue, color: 'gray.3' },
        { y: maxValue, color: 'gray.3' },
      ]}
      valueFormatter={valueFormatter}
      tooltipProps={{
        content: ({ label, payload }) => {
          if (!payload?.length || !label) return null
          const value = payload[0]?.value as number
          return (
            <ChartTooltip label={String(label)} value={valueFormatter(value)} />
          )
        },
      }}
    />
  )
}
