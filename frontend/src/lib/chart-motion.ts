import { useEffect, useRef, useState } from 'react'
import { foundation } from './design-system/foundation'
import type { ChartDataPoint } from '../components/Chart'

export type ChartFramePoint = ChartDataPoint & {
  plotX: number
  plotValue: number
}

export function chartFrame(
  data: Array<ChartDataPoint>,
): Array<ChartFramePoint> {
  const values = data.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return data.map((point, index) => ({
    ...point,
    plotX: data.length > 1 ? index / (data.length - 1) : 0.5,
    plotValue: (point.value - min + range * 0.1) / (max - min + range * 0.2),
  }))
}
export const chartDataKey = (data: Array<ChartDataPoint>) =>
  JSON.stringify(
    data.map((point) => [point.date, point.label, point.value, point.money]),
  )

function sample(
  frame: Array<ChartFramePoint>,
  position: number,
  byDate: boolean,
) {
  const key = (point: ChartFramePoint) =>
    byDate ? Date.parse(point.date) : point.plotX
  if (position <= key(frame[0])) return frame[0]
  for (let index = 1; index < frame.length; index++) {
    const right = frame[index]
    if (key(right) >= position) {
      const left = frame[index - 1]
      const fraction = (position - key(left)) / (key(right) - key(left) || 1)
      return {
        plotX: left.plotX + (right.plotX - left.plotX) * fraction,
        plotValue:
          left.plotValue + (right.plotValue - left.plotValue) * fraction,
      }
    }
  }
  return frame[frame.length - 1]
}

/** Align dates, including inserted/removed endpoints, instead of matching indexes. */
export function interpolateChartFrame(
  from: Array<ChartFramePoint>,
  to: Array<ChartFramePoint>,
  progress: number,
  samePeriod: boolean,
): Array<ChartFramePoint> {
  if (progress >= 1 || !from.length || !to.length) return to
  if (progress <= 0) return from
  const byDate =
    samePeriod &&
    [...from, ...to].every((point) => Number.isFinite(Date.parse(point.date)))
  const positions = [
    ...new Set(
      [...from, ...to].map((point) =>
        byDate ? Date.parse(point.date) : point.plotX,
      ),
    ),
  ].sort((a, b) => a - b)
  return positions.map((position) => {
    const oldPoint = sample(from, position, byDate)
    const newPoint = sample(to, position, byDate)
    // Intermediate points are geometry only; interactions are disabled until settled.
    const exact =
      to.find(
        (point) => (byDate ? Date.parse(point.date) : point.plotX) === position,
      ) ?? to[0]
    const datePosition = byDate
      ? position
      : sample(
          to.map((point) => ({ ...point, plotValue: Date.parse(point.date) })),
          position,
          false,
        ).plotValue
    return {
      ...exact,
      date: byDate
        ? ([...to, ...from].find((point) => Date.parse(point.date) === position)
            ?.date ?? exact.date)
        : Number.isFinite(datePosition)
          ? new Date(datePosition).toISOString()
          : exact.date,
      plotX: oldPoint.plotX + (newPoint.plotX - oldPoint.plotX) * progress,
      plotValue:
        oldPoint.plotValue +
        (newPoint.plotValue - oldPoint.plotValue) * progress,
    }
  })
}

export function useChartMotion(
  data: Array<ChartDataPoint>,
  enabled: boolean,
  transitionKey?: string,
) {
  const key = chartDataKey(data)
  const [state, setState] = useState(() => ({
    frame: chartFrame(data),
    moving: false,
  }))
  const displayed = useRef(state.frame)
  const previous = useRef({ key, transitionKey, enabled })
  useEffect(() => {
    const last = previous.current
    previous.current = { key, transitionKey, enabled }
    if (
      last.key === key &&
      last.transitionKey === transitionKey &&
      last.enabled === enabled
    )
      return
    const target = chartFrame(data)
    if (
      !enabled ||
      !last.enabled ||
      !target.length ||
      !displayed.current.length
    ) {
      displayed.current = target
      setState({ frame: target, moving: false })
      return
    }
    const from = displayed.current
    const start = performance.now()
    let request = 0
    const update = (now: number) => {
      const elapsed = Math.min(1, (now - start) / foundation.motion.chart)
      const progress = elapsed * elapsed * (3 - 2 * elapsed)
      const frame = interpolateChartFrame(
        from,
        target,
        progress,
        last.transitionKey === transitionKey,
      )
      displayed.current = frame
      setState({ frame, moving: elapsed < 1 })
      if (elapsed < 1) request = requestAnimationFrame(update)
    }
    setState((current) => ({ ...current, moving: true }))
    request = requestAnimationFrame(update)
    return () => cancelAnimationFrame(request)
    // Structural identity deliberately ignores equivalent arrays and parent callback churn.
  }, [key, transitionKey, enabled])
  // New real points must replace decorative/empty data in the same render.
  if (!enabled || !previous.current.enabled || !displayed.current.length)
    return { frame: chartFrame(data), moving: false }
  return { ...state, moving: state.moving || previous.current.key !== key }
}
