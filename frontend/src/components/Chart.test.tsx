import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Chart } from './Chart'
import type { ComponentProps } from 'react'
import type { AreaChart } from '@mantine/charts'

let chartProps: ComponentProps<typeof AreaChart>
vi.mock('@mantine/charts', () => ({
  AreaChart: (props: ComponentProps<typeof AreaChart>) => {
    chartProps = props
    return <div data-testid="chart" />
  },
}))

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const point = {
  date: '2026-09-01',
  label: 'Sep 1',
  value: 100,
  money: {
    money: { amount: '10000', currency: 'USD' },
    sign: 'positive' as const,
  },
}

function setup() {
  const onDataPointHover = vi.fn()
  render(
    <MantineProvider env="test">
      <Chart
        data={[point]}
        valueFormatter={String}
        onDataPointHover={onDataPointHover}
      />
    </MantineProvider>,
  )
  return { chart: screen.getByTestId('chart'), onDataPointHover }
}

function move(isTooltipActive = true) {
  act(() => {
    chartProps.areaChartProps?.onMouseMove?.(
      {
        activeIndex: '0',
        isTooltipActive,
        activeCoordinate: undefined,
        activeDataKey: undefined,
        activeLabel: undefined,
        activeTooltipIndex: '0',
      },
      {} as never,
    )
  })
}

describe('Chart interaction cleanup', () => {
  it('clears the summary and tooltip on leave and ignores queued movement', () => {
    const { chart, onDataPointHover } = setup()
    fireEvent.mouseEnter(chart)
    move()
    expect(onDataPointHover).toHaveBeenLastCalledWith(point)

    fireEvent.mouseLeave(chart)
    expect(onDataPointHover).toHaveBeenLastCalledWith()
    expect(chartProps.tooltipProps?.active).toBe(false)
    onDataPointHover.mockClear()
    move()
    expect(onDataPointHover).not.toHaveBeenCalled()

    fireEvent.mouseEnter(chart)
    move()
    expect(onDataPointHover).toHaveBeenLastCalledWith(point)
  })

  it('clears on outside pointer movement even when mouse-leave is missed', () => {
    const { chart, onDataPointHover } = setup()
    fireEvent.mouseEnter(chart)
    move()
    expect(onDataPointHover).toHaveBeenLastCalledWith(point)

    // SVG changes can prevent React's mouse-leave from reaching the wrapper.
    fireEvent(
      document.body,
      new MouseEvent('pointermove', {
        bubbles: true,
        clientX: 500,
        clientY: 500,
      }),
    )
    expect(onDataPointHover).toHaveBeenLastCalledWith()
    expect(chartProps.tooltipProps?.active).toBe(false)
    onDataPointHover.mockClear()
    move()
    expect(onDataPointHover).not.toHaveBeenCalled()
  })

  it('keeps selection while the pointer is within the chart', () => {
    const { chart, onDataPointHover } = setup()
    vi.spyOn(chart.parentElement!, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 600,
      top: 0,
      bottom: 200,
      x: 0,
      y: 0,
      width: 600,
      height: 200,
      toJSON: () => ({}),
    })
    fireEvent.mouseEnter(chart)
    move()
    onDataPointHover.mockClear()
    fireEvent(
      chart,
      new MouseEvent('pointermove', {
        bubbles: true,
        clientX: 100,
        clientY: 100,
      }),
    )
    expect(onDataPointHover).not.toHaveBeenCalled()
    expect(chartProps.tooltipProps?.active).toBeUndefined()
  })

  it.each(['window blur', 'pointer leaves window'])(
    'clears selection on %s without a chart leave event',
    (event) => {
      const { chart, onDataPointHover } = setup()
      fireEvent.mouseEnter(chart)
      move()
      if (event === 'window blur') fireEvent.blur(window)
      else
        fireEvent(
          document.body,
          new MouseEvent('pointerout', {
            bubbles: true,
            relatedTarget: null,
          }),
        )
      expect(onDataPointHover).toHaveBeenLastCalledWith()
      expect(chartProps.tooltipProps?.active).toBe(false)
    },
  )

  it('clears a retained index when the tooltip becomes inactive', () => {
    const { chart, onDataPointHover } = setup()
    fireEvent.mouseEnter(chart)
    move()
    move(false)
    expect(onDataPointHover).toHaveBeenLastCalledWith(undefined)
  })

  it.each(['touchEnd', 'touchCancel'] as const)(
    'clears selection after %s and ignores queued movement',
    (event) => {
      const { chart, onDataPointHover } = setup()
      fireEvent.touchStart(chart)
      move()
      expect(onDataPointHover).toHaveBeenLastCalledWith(point)
      fireEvent[event](chart)
      expect(onDataPointHover).toHaveBeenLastCalledWith()
      expect(chartProps.tooltipProps?.active).toBe(false)
      onDataPointHover.mockClear()
      move()
      expect(onDataPointHover).not.toHaveBeenCalled()
    },
  )
})

it('disables stale hover while the range is loading and restores it afterwards', () => {
  const onDataPointHover = vi.fn()
  const view = (interactive: boolean) => (
    <MantineProvider env="test">
      <Chart
        data={[point]}
        valueFormatter={String}
        interactive={interactive}
        onDataPointHover={onDataPointHover}
      />
    </MantineProvider>
  )
  const { rerender } = render(view(false))
  fireEvent.mouseEnter(screen.getByTestId('chart').parentElement!)
  move()
  expect(onDataPointHover).not.toHaveBeenCalled()
  expect(chartProps.tooltipProps?.active).toBe(false)
  rerender(view(true))
  move()
  expect(onDataPointHover).toHaveBeenCalledWith(point)
})

it('keeps hover available when chart animation is enabled', () => {
  const onDataPointHover = vi.fn()
  render(
    <MantineProvider env="test">
      <Chart
        data={[point]}
        valueFormatter={String}
        animate
        onDataPointHover={onDataPointHover}
      />
    </MantineProvider>,
  )
  fireEvent.mouseEnter(screen.getByTestId('chart'))
  move()
  expect(onDataPointHover).toHaveBeenLastCalledWith(point)
  expect(chartProps.tooltipProps?.active).toBeUndefined()
})

it('never exposes decorative points to hover while loading', () => {
  vi.useFakeTimers()
  const onDataPointHover = vi.fn()
  const view = (loading: boolean) => (
    <MantineProvider env="test">
      <Chart
        data={[point]}
        valueFormatter={String}
        placeholder
        loading={loading}
        onDataPointHover={onDataPointHover}
      />
    </MantineProvider>
  )
  const { rerender } = render(view(true))
  act(() => vi.advanceTimersByTime(120))
  expect(chartProps.data).not.toEqual([point])
  fireEvent.mouseEnter(screen.getByTestId('chart'))
  move()
  expect(onDataPointHover).not.toHaveBeenCalled()
  rerender(view(false))
  expect(chartProps.data).toEqual([point])
  move()
  expect(onDataPointHover).toHaveBeenLastCalledWith(point)
})
