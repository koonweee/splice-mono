import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockProjectionResponse } from '../../lib/projections/mock-data'
import { ProjectionChart } from './ProjectionChart'
import type { ReactNode } from 'react'

type MockChartProps = {
  children?: ReactNode
  dataKey?: string
  label?: { value?: string }
  name?: string
}

vi.mock('recharts', () => ({
  Area: ({ dataKey }: MockChartProps) => (
    <div data-testid={`area-${dataKey ?? 'unknown'}`} />
  ),
  CartesianGrid: () => <div data-testid="grid" />,
  ComposedChart: ({ children }: MockChartProps) => (
    <div data-testid="composed-chart">{children}</div>
  ),
  Line: ({ dataKey, name }: MockChartProps) => (
    <div data-testid={`line-${dataKey ?? 'unknown'}`}>{name}</div>
  ),
  ReferenceDot: ({ label }: MockChartProps) => (
    <div data-testid="chart-annotation">{label?.value}</div>
  ),
  ReferenceLine: ({ label }: MockChartProps) => (
    <div data-testid="today-marker">{label?.value}</div>
  ),
  ResponsiveContainer: ({ children }: MockChartProps) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Tooltip: () => <div data-testid="tooltip" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
}))

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
  })
  const resizeObserverMock = vi.fn().mockImplementation(() => ({
    disconnect: vi.fn(),
    observe: vi.fn(),
    unobserve: vi.fn(),
  }))
  Object.defineProperty(window, 'ResizeObserver', {
    value: resizeObserverMock,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: resizeObserverMock,
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
})

describe('ProjectionChart', () => {
  it('renders historical, projected, confidence, today, and annotation layers', async () => {
    render(
      <MantineProvider>
        <ProjectionChart result={mockProjectionResponse.result} />
      </MantineProvider>,
    )

    expect(screen.getByText(/net worth projection/i)).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByTestId('line-historical')).toBeTruthy()
    })
    expect(screen.getByTestId('line-projectedMedian')).toBeTruthy()
    expect(screen.getByTestId('area-projectedLow')).toBeTruthy()
    expect(screen.getByTestId('area-projectedHigh')).toBeTruthy()
    expect(screen.getByTestId('today-marker').textContent).toBe('Today')
    expect(screen.getByText(/portfolio crosses \$1m/i)).toBeTruthy()
  })
})
