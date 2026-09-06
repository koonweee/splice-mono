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
