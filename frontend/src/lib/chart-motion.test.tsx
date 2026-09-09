import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chartFrame,
  interpolateChartFrame,
  useChartMotion,
} from './chart-motion'
import type { ChartDataPoint } from '../components/Chart'

const point = (date: string, value: number): ChartDataPoint => ({
  date,
  label: date,
  value,
  money: {
    money: { amount: String(value * 100), currency: 'USD' },
    sign: 'positive',
  },
})
const old = [
  point('2026-09-01', 100),
  point('2026-09-03', 130),
  point('2026-09-05', 120),
]
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('chart geometry continuity', () => {
  it('centers constant series and removes old dates at completion', () => {
    const constant = chartFrame([
      point('2026-09-01', 100),
      point('2026-09-02', 100),
    ])
    expect(constant.map((p) => p.plotValue)).toEqual([0.5, 0.5])
    const target = chartFrame([old[0], old[2]])
    expect(
      interpolateChartFrame(chartFrame(old), target, 0.5, true),
    ).toHaveLength(3)
    expect(interpolateChartFrame(chartFrame(old), target, 1, true)).toEqual(
      target,
    )
  })

  it('aligns inserted dates rather than shifting old points by index, settling to exact data', () => {
    const from = chartFrame(old)
    const updated = [
      old[0],
      point('2026-09-02', 110),
      old[1],
      old[2],
      point('2026-09-06', 122),
    ]
    const to = chartFrame(updated)
    const middle = interpolateChartFrame(from, to, 0.5, true)
    expect(middle.find((p) => p.date === '2026-09-03')?.plotValue).toBeCloseTo(
      (from[1].plotValue + to[2].plotValue) / 2,
    )
    expect(interpolateChartFrame(from, to, 0, true)).toBe(from)
    expect(interpolateChartFrame(from, to, 1, true)).toBe(to)
    expect(to.map(({ plotX: _x, plotValue: _y, ...p }) => p)).toEqual(updated)
  })
  it('interpolates domains in plotted space instead of abruptly rescaling the old values', () => {
    const from = chartFrame(old)
    const to = chartFrame([old[0], point('2026-09-03', 300), old[2]])
    const middle = interpolateChartFrame(from, to, 0.5, true)
    expect(middle[2].plotValue).toBeCloseTo(
      (from[2].plotValue + to[2].plotValue) / 2,
    )
    expect(middle.every((p) => p.plotValue >= 0 && p.plotValue <= 1)).toBe(true)
  })
  it('does not animate initial/equivalent data and starts interruptions from displayed geometry', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16),
    )
    vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) =>
      clearTimeout(id),
    )
    const { result, rerender } = renderHook(
      ({ data, enabled }) => useChartMotion(data, enabled, 'month'),
      { initialProps: { data: old, enabled: true } },
    )
    const initial = result.current.frame
    rerender({ data: structuredClone(old), enabled: true })
    expect(result.current.frame).toBe(initial)
    expect(result.current.moving).toBe(false)
    rerender({
      data: [old[0], point('2026-09-03', 150), old[2]],
      enabled: true,
    })
    act(() => vi.advanceTimersByTime(160))
    const displayed = result.current.frame
    rerender({
      data: [old[0], point('2026-09-03', 160), old[2]],
      enabled: true,
    })
    expect(result.current.frame).toBe(displayed)
    act(() => vi.advanceTimersByTime(500))
    expect(result.current.moving).toBe(false)
    expect(result.current.frame[1].value).toBe(160)
    rerender({ data: old, enabled: false })
    expect(result.current.frame).toEqual(chartFrame(old))
    expect(result.current.moving).toBe(false)
  })
})
