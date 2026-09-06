import { AreaChart } from '@mantine/charts'
import { useReducedMotion } from '@mantine/hooks'
import { Box, Paper, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import placeholderStyles from './loading/ChartSkeleton.module.css'
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

// Normalized decorative points, never exposed as balances or tooltip values.
const PLACEHOLDER_POINTS: Array<ChartDataPoint> = [
  20, 24, 23, 30, 27, 34, 33, 40, 38, 45, 44, 49,
].map((value, index) => ({
  date: String(index),
  label: '',
  value,
  money: { money: { amount: '0', currency: 'USD' }, sign: 'positive' },
}))

interface ChartProps {
  data: Array<ChartDataPoint>
  valueFormatter: (value: number) => string
  pointFormatter?: (point: ChartDataPoint) => string
  placeholder?: boolean
  loading?: boolean
  animate?: boolean
  interactive?: boolean
  minimal?: boolean
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
  minimal = false,
  animate = false,
  placeholder = false,
  loading = false,
  interactive = true,
  color = 'teal.6',
  mb,
  onDataPointHover,
}: ChartProps) {
  const [initialized, setInitialized] = useState(!placeholder)
  useEffect(() => {
    if (!placeholder) return
    // Give the responsive chart time to measure and paint its initial points.
    const timer = window.setTimeout(() => setInitialized(true), 120)
    return () => window.clearTimeout(timer)
  }, [placeholder])
  const showingPlaceholder = placeholder && (!initialized || loading)
  const plottedData = showingPlaceholder ? PLACEHOLDER_POINTS : data
  const reducedMotion = useReducedMotion()
  const canInteract = interactive && !showingPlaceholder
  const containerRef = useRef<HTMLDivElement>(null)
  const interacting = useRef(false)
  const pointerWithin = useRef(false)
  const [interactionActive, setInteractionActive] = useState(false)

  useEffect(() => {
    const clearInteraction = () => {
      pointerWithin.current = false
      if (!interacting.current) return
      interacting.current = false
      setInteractionActive(false)
      onDataPointHover?.()
    }
    if (!canInteract && interacting.current) {
      interacting.current = false
      setInteractionActive(false)
      onDataPointHover?.()
    }
    const handlePointerMove = (event: PointerEvent) => {
      const container = containerRef.current
      if (!container || !pointerWithin.current) return
      const bounds = container.getBoundingClientRect()
      if (
        event.clientX < bounds.left ||
        event.clientX >= bounds.right ||
        event.clientY < bounds.top ||
        event.clientY >= bounds.bottom ||
        !(event.target instanceof Node && container.contains(event.target))
      ) {
        clearInteraction()
      }
    }
    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget === null) clearInteraction()
    }
    const handleVisibilityChange = () => {
      if (document.hidden) clearInteraction()
    }

    // A rapidly changing SVG can miss React's synthesized mouse-leave event.
    // Capture pointer movement outside the chart independently of that event.
    document.addEventListener('pointermove', handlePointerMove, true)
    document.addEventListener('pointerout', handlePointerOut, true)
    window.addEventListener('blur', clearInteraction)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove, true)
      document.removeEventListener('pointerout', handlePointerOut, true)
      window.removeEventListener('blur', clearInteraction)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [onDataPointHover, canInteract])

  if (plottedData.length === 0) {
    return null
  }

  // Calculate min and max for y-axis ticks with padding for label visibility
  const values = plottedData.map((d) => d.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue || 1 // Avoid division by zero
  const padding = range * 0.1 // 10% padding
  const domainMin = minValue - padding
  const domainMax = maxValue + padding

  const handleStart = () => {
    pointerWithin.current = true
    if (!canInteract) return
    interacting.current = true
    setInteractionActive(true)
  }

  const handleLeave = () => {
    pointerWithin.current = false
    interacting.current = false
    setInteractionActive(false)
    onDataPointHover?.()
  }

  const handleMove = (state: {
    activeIndex?: unknown
    isTooltipActive?: boolean
  }) => {
    // Recharts queues movement callbacks; a callback can arrive after leave.
    if (!canInteract || !pointerWithin.current) return
    if (!interacting.current) {
      interacting.current = true
      setInteractionActive(true)
    }
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
      ref={containerRef}
      aria-busy={!interactive || showingPlaceholder}
      aria-label={showingPlaceholder ? 'Loading chart' : undefined}
      className={showingPlaceholder ? placeholderStyles.graph : undefined}
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
        data={plottedData}
        dataKey="date"
        series={[{ name: 'value', color }]}
        curveType="monotone"
        withDots={!minimal || plottedData.length === 1}
        strokeWidth={minimal ? 1.5 : 2}
        gridAxis="none"
        withXAxis={false}
        withYAxis={false}
        withGradient
        yAxisProps={{
          domain: [domainMin, domainMax],
        }}
        valueFormatter={valueFormatter}
        areaProps={{
          isAnimationActive: animate && !reducedMotion && !showingPlaceholder,
          animationDuration: 400,
          animationEasing: 'ease-in-out',
        }}
        areaChartProps={{
          onMouseMove: handleMove,
          onTouchMove: handleMove,
        }}
        tooltipProps={{
          active: canInteract && interactionActive ? undefined : false,
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
