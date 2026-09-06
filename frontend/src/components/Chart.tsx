import { AreaChart } from '@mantine/charts'
import { Box, Paper, Text } from '@mantine/core'
import { useRef, useState } from 'react'
import type { MoneyWithSign } from '../api/models'

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
  date: string
  label: string
  value: number
  money: MoneyWithSign
}

interface ChartProps {
  data: Array<ChartDataPoint>
  valueFormatter: (value: number) => string
  pointFormatter?: (point: ChartDataPoint) => string
  height?: number
  color?: string
  mb?: string
  onDataPointHover?: (point?: ChartDataPoint) => void
}

export function Chart({
  data,
  valueFormatter,
  pointFormatter,
  height = 280,
  color = 'teal.6',
  mb,
  onDataPointHover,
}: ChartProps) {
  const interacting = useRef(false)
  const [interactionActive, setInteractionActive] = useState(false)

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

  const handleStart = () => {
    interacting.current = true
    setInteractionActive(true)
  }

  const handleLeave = () => {
    interacting.current = false
    setInteractionActive(false)
    onDataPointHover?.()
  }

  const handleMove = (state: {
    activeIndex?: unknown
    isTooltipActive?: boolean
  }) => {
    // Recharts queues movement callbacks; a callback can arrive after leave.
    if (!interacting.current) return
    const index = Number(state.activeIndex)
    const point =
      state.isTooltipActive &&
      state.activeIndex != null &&
      Number.isInteger(index)
        ? data[index]
        : undefined
    onDataPointHover?.(point)
  }

  return (
    <Box
      mb={mb}
      onMouseEnter={handleStart}
      onMouseLeave={handleLeave}
      onTouchStart={handleStart}
      onTouchEnd={handleLeave}
      onTouchCancel={handleLeave}
      onKeyDown={handleStart}
      onBlur={handleLeave}
    >
      <AreaChart
        h={height}
        data={data}
        dataKey="date"
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
          onTouchMove: handleMove,
        }}
        tooltipProps={{
          active: interactionActive ? undefined : false,
          content: ({ label, payload }) => {
            if (!payload.length) return null
            const point = payload[0]
            return (
              <ChartTooltip
                label={point.payload.label || String(label)}
                value={
                  onDataPointHover
                    ? undefined
                    : pointFormatter
                      ? pointFormatter(point.payload)
                      : valueFormatter(point.value)
                }
              />
            )
          },
        }}
      />
    </Box>
  )
}
