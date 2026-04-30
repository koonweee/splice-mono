import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoneyWithSignSign } from '../api/models'
import { NetWorthCard } from './NetWorthCard'
import { TimePeriod } from '@/lib/types'

vi.mock('./Chart', () => ({
  Chart: ({
    onDataPointHover,
  }: {
    onDataPointHover?: (point?: {
      date: string
      label: string
      value: number
    }) => void
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onDataPointHover?.({
            date: '2026-04-01',
            label: 'Apr 1',
            value: 4321,
          })
        }
      >
        hover point
      </button>
      <button type="button" onClick={() => onDataPointHover?.()}>
        clear hover
      </button>
    </div>
  ),
}))

function renderNetWorthCard(
  props?: Partial<Parameters<typeof NetWorthCard>[0]>,
) {
  const onToggleBalancesHidden = vi.fn()

  render(
    <MantineProvider>
      <NetWorthCard
        balancesHidden={false}
        netWorth={{
          money: { amount: 12345, currency: 'USD' },
          sign: MoneyWithSignSign.positive,
        }}
        onToggleBalancesHidden={onToggleBalancesHidden}
        changePercent={12.34}
        changeAmount={{
          money: { amount: 4567, currency: 'USD' },
          sign: MoneyWithSignSign.positive,
        }}
        comparisonPeriod={TimePeriod.month}
        chartData={[{ date: '2026-04-01', label: 'Apr 1', value: 4321 }]}
        {...props}
      />
    </MantineProvider>,
  )

  return { onToggleBalancesHidden }
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('NetWorthCard', () => {
  it('renders the current value and calls the toggle handler', () => {
    const { onToggleBalancesHidden } = renderNetWorthCard()

    expect(screen.getByText('$123.45')).toBeTruthy()
    expect(screen.getByRole('button', { name: /hide balances/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /hide balances/i }))

    expect(onToggleBalancesHidden).toHaveBeenCalledTimes(1)
  })

  it('masks the summary value and hovered chart value when hidden', () => {
    renderNetWorthCard({ balancesHidden: true })

    expect(screen.getByText('****')).toBeTruthy()
    expect(screen.queryByText('$123.45')).toBeNull()
    expect(screen.getByRole('button', { name: /show balances/i })).toBeTruthy()
    expect(screen.getByText('+12.34%')).toBeTruthy()
    expect(screen.getByText('from last month')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /hover point/i }))

    expect(screen.getByText('Net worth - Apr 1')).toBeTruthy()
    expect(screen.getByText('****')).toBeTruthy()
    expect(screen.queryByText('$4,321.00')).toBeNull()
  })

  it('shows the absolute net worth change from the percentage trigger', async () => {
    renderNetWorthCard()

    fireEvent.click(screen.getByText('+12.34%'))

    expect(await screen.findByText('+$45.67')).toBeTruthy()
  })
})
