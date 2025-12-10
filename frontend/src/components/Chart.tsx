import { AreaChart } from '@mantine/charts'
import { Paper, Text } from '@mantine/core'
import isNumber from 'lodash/isNumber'

function ChartTooltip({ label, value }: { label: string; value?: string }) {
  return (
    <Paper px="md" py="xs" withBorder shadow="md" radius="md">
      <Text size="xs" c={value ? 'dimmed' : undefined} mb={value ? 4 : 0}>
        {label}
      </Text>
      {value && (
        <Text fw={600} size="lg">
          {value}
        </Text>
      )}
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
  onDataPointHover?: (point: ChartDataPoint | null) => void
}

export function Chart({
  data,
  valueFormatter,
  height = 280,
  color = 'teal.6',
  mb,
  onDataPointHover,
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

  const handleMove = (state: { activeIndex?: unknown }) => {
    const { activeIndex } = state
    if (activeIndex != null && isNumber(Number(activeIndex))) {
      const point = data[Number(activeIndex)]
      onDataPointHover?.(point)
    } else {
      onDataPointHover?.(null)
    }
  }

  const handleLeave = () => onDataPointHover?.(null)

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
      withYAxis={false}
      withGradient
      yAxisProps={{
        domain: [domainMin, domainMax],
      }}
      valueFormatter={valueFormatter}
      areaChartProps={{
        onMouseMove: handleMove,
        onMouseLeave: handleLeave,
        onTouchMove: handleMove,
        onTouchEnd: handleLeave,
      }}
      tooltipProps={{
        content: ({ label, payload }) => {
          if (!label || !payload) return null
          const point = payload[0]
          return (
            <ChartTooltip
              label={String(label)}
              value={onDataPointHover ? undefined : valueFormatter(point.value)}
            />
          )
        },
      }}
    />
  )
}
