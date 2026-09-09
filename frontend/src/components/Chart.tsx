import { AreaChart } from '@mantine/charts'
import { useReducedMotion } from '@mantine/hooks'
import { Box, Paper, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { useChartMotion } from '../lib/chart-motion'
import { foundation } from '../lib/design-system/foundation'
import placeholderStyles from './Chart.skeleton.module.css'
import styles from './Chart.module.css'
import type { TouchEvent } from 'react'
import type { TooltipContentProps } from 'recharts'
import type { MoneyWithSign } from '../api/models'

function ChartTooltip({
  label,
  value,
  inspectedPoint,
  onInspect,
}: {
  label: string
  value?: string
  inspectedPoint?: ChartDataPoint
  onInspect?: (point?: ChartDataPoint) => void
}) {
  const inspectCallback = useRef(onInspect)
  useEffect(() => {
    inspectCallback.current = onInspect
  }, [onInspect])
  const inspectionEnabled = Boolean(onInspect)
  // Recharts keyboard selection does not emit its pointer movement callback.
  // Notify for selection changes, not callback identity: a headline update can
  // recreate the parent's callback and otherwise cause an effect feedback loop.
  useEffect(() => {
    if (inspectionEnabled) inspectCallback.current?.(inspectedPoint)
  }, [inspectedPoint, inspectionEnabled])
  return (
    <Paper px="md" py="xs" withBorder shadow="md" radius="md">
      <Text
        data-typography="caption"
        c={value ? 'dimmed' : undefined}
        mb={value ? 4 : 0}
      >
        {label}
      </Text>
      {value && <Text data-typography="amountLarge">{value}</Text>}
    </Paper>
  )
}

// Recharts clones element content while preserving its component identity.
// An inline function here is mounted as a new component on every Chart render.
function ChartTooltipContent({
  label,
  payload,
  active,
  onInspect,
  showValue,
  pointFormatter,
  valueFormatter,
}: Partial<TooltipContentProps<number, string>> & {
  onInspect?: (point?: ChartDataPoint) => void
  showValue: boolean
  pointFormatter?: (point: ChartDataPoint) => string
  valueFormatter: (value: number) => string
}) {
  const point = payload?.[0]
  if (!point?.payload) return null
  return (
    <ChartTooltip
      label={point.payload.label || String(label)}
      inspectedPoint={active ? point.payload : undefined}
      onInspect={onInspect}
      value={
        !showValue
          ? undefined
          : pointFormatter
            ? pointFormatter(point.payload)
            : valueFormatter(point.payload.value)
      }
    />
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
  transitionKey?: string
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
  transitionKey,
  placeholder = false,
  loading = false,
  interactive = true,
  color = 'var(--splice-chart-color)',
  mb,
  onDataPointHover,
}: ChartProps) {
  const lastReal = useRef<{ data: Array<ChartDataPoint>; key?: string } | null>(
    null,
  )
  if (data.length) lastReal.current = { data, key: transitionKey }
  else if (!loading) lastReal.current = null
  const retainedData = loading && !data.length ? lastReal.current : null
  const showingPlaceholder =
    placeholder && data.length === 0 && loading && !retainedData
  const sourceData =
    retainedData?.data ?? (showingPlaceholder ? PLACEHOLDER_POINTS : data)
  const reducedMotion = useReducedMotion()
  const motion = useChartMotion(
    sourceData,
    animate && !reducedMotion && !showingPlaceholder,
    retainedData?.key ?? transitionKey,
  )
  const plottedData = sourceData.length ? motion.frame : []
  const canInteract =
    interactive && !loading && !showingPlaceholder && !motion.moving
  const containerRef = useRef<HTMLDivElement>(null)
  const interacting = useRef(false)
  const pointerWithin = useRef(false)
  const [interactionActive, setInteractionActive] = useState(false)
  const [keyboardActive, setKeyboardActive] = useState(false)
  const lastTouch = useRef(0)
  const touchCancelled = useRef(false)
  const [touchSelection, setTouchSelection] = useState<{
    data: Array<ChartDataPoint>
    index: number
  }>()
  const touchPoint =
    canInteract && touchSelection?.data === data
      ? data[touchSelection.index]
      : undefined
  const touchPercent =
    touchSelection && data.length > 1
      ? (touchSelection.index / (data.length - 1)) * 100
      : 50

  useEffect(() => {
    if (touchSelection && touchSelection.data !== data) {
      setTouchSelection(undefined)
      interacting.current = false
      onDataPointHover?.()
    }
  }, [data, touchSelection, onDataPointHover])

  useEffect(() => {
    const clearInteraction = () => {
      touchCancelled.current = true
      pointerWithin.current = false
      setTouchSelection(undefined)
      if (!interacting.current) return
      interacting.current = false
      setInteractionActive(false)
      setKeyboardActive(false)
      onDataPointHover?.()
    }
    if (!canInteract && interacting.current) {
      interacting.current = false
      setInteractionActive(false)
      setKeyboardActive(false)
      setTouchSelection(undefined)
      onDataPointHover?.()
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
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
      if (event.pointerType !== 'touch' && event.relatedTarget === null)
        clearInteraction()
    }
    const handleOutsidePress = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      )
        clearInteraction()
    }
    const handleVisibilityChange = () => {
      if (document.hidden) clearInteraction()
    }

    // A rapidly changing SVG can miss React's synthesized mouse-leave event.
    // Capture pointer movement outside the chart independently of that event.
    document.addEventListener('scroll', clearInteraction, true)
    document.addEventListener('pointerdown', handleOutsidePress, true)
    document.addEventListener('pointermove', handlePointerMove, true)
    document.addEventListener('pointerout', handlePointerOut, true)
    window.addEventListener('blur', clearInteraction)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('scroll', clearInteraction, true)
      document.removeEventListener('pointerdown', handleOutsidePress, true)
      document.removeEventListener('pointermove', handlePointerMove, true)
      document.removeEventListener('pointerout', handlePointerOut, true)
      window.removeEventListener('blur', clearInteraction)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [onDataPointHover, canInteract])

  if (plottedData.length === 0) {
    return null
  }

  const handleStart = () => {
    if (Date.now() - lastTouch.current < 800) return
    setTouchSelection(undefined)
    setKeyboardActive(false)
    pointerWithin.current = true
    if (!canInteract) return
    interacting.current = true
    setInteractionActive(true)
  }

  const handleLeave = () => {
    touchCancelled.current = true
    setTouchSelection(undefined)
    pointerWithin.current = false
    interacting.current = false
    setInteractionActive(false)
    setKeyboardActive(false)
    onDataPointHover?.()
  }

  const handleTouch = (event: TouchEvent<HTMLDivElement>) => {
    lastTouch.current = Date.now()
    const touch = event.touches[0]
    if (!canInteract || touchCancelled.current || event.touches.length !== 1)
      return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width) return
    const fraction = Math.max(
      0,
      Math.min(1, (touch.clientX - bounds.left) / bounds.width),
    )
    const index = Math.round(fraction * (data.length - 1))
    pointerWithin.current = false
    interacting.current = true
    setKeyboardActive(false)
    setInteractionActive(false)
    setTouchSelection((previous) =>
      previous?.data === data && previous.index === index
        ? previous
        : { data, index },
    )
    onDataPointHover?.(data[index])
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
      role={showingPlaceholder ? 'status' : undefined}
      aria-label={showingPlaceholder ? 'Loading chart' : undefined}
      className={showingPlaceholder ? placeholderStyles.graph : undefined}
      mb={mb}
      pos="relative"
      style={{ touchAction: 'pan-y' }}
      onMouseEnter={handleStart}
      onMouseLeave={() => {
        if (Date.now() - lastTouch.current >= 800) handleLeave()
      }}
      onTouchStart={(event) => {
        touchCancelled.current = false
        handleTouch(event)
      }}
      onTouchMove={handleTouch}
      onTouchEnd={() => {
        lastTouch.current = Date.now()
      }}
      onTouchCancel={handleLeave}
      onFocus={() => {
        if (
          !canInteract ||
          pointerWithin.current ||
          Date.now() - lastTouch.current < 800
        )
          return
        interacting.current = true
        setKeyboardActive(true)
        setInteractionActive(true)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') handleLeave()
        else if (
          canInteract &&
          ['ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)
        ) {
          setTouchSelection(undefined)
          interacting.current = true
          setKeyboardActive(true)
          setInteractionActive(true)
        }
      }}
      onBlur={() => {
        if (!touchPoint) handleLeave()
      }}
    >
      <AreaChart
        className={minimal ? styles.softArea : undefined}
        h={height}
        data={plottedData}
        dataKey="plotX"
        series={[{ name: 'plotValue', color }]}
        curveType="monotone"
        withDots={!minimal || plottedData.length === 1}
        strokeWidth={minimal ? 1.5 : 2}
        gridAxis="none"
        withXAxis={false}
        withYAxis={false}
        withGradient
        fillOpacity={
          minimal ? foundation.chart.minimalFill : foundation.chart.fill
        }
        yAxisProps={{
          domain: [0, 1],
          allowDataOverflow: true,
        }}
        xAxisProps={{ type: 'number', domain: [0, 1], allowDataOverflow: true }}
        valueFormatter={valueFormatter}
        areaProps={{
          isAnimationActive: false,
          animationDuration: foundation.motion.chart,
          animationEasing: 'ease-in-out',
        }}
        areaChartProps={{
          onMouseMove: handleMove,
        }}
        tooltipProps={{
          isAnimationActive: false,
          active:
            canInteract && interactionActive && !touchPoint ? undefined : false,
          content: (
            <ChartTooltipContent
              onInspect={
                canInteract && keyboardActive ? onDataPointHover : undefined
              }
              showValue={!onDataPointHover}
              pointFormatter={pointFormatter}
              valueFormatter={valueFormatter}
            />
          ),
        }}
      />
      {touchPoint && (
        <>
          <Box
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${touchPercent}%`,
              borderLeft: '1px solid var(--splice-border)',
              pointerEvents: 'none',
            }}
          />
          <Box
            role="status"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <ChartTooltip
              label={touchPoint.label}
              value={
                onDataPointHover
                  ? undefined
                  : pointFormatter
                    ? pointFormatter(touchPoint)
                    : valueFormatter(touchPoint.value)
              }
            />
          </Box>
        </>
      )}
    </Box>
  )
}
