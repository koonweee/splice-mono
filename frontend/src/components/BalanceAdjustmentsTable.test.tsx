import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BalanceAdjustmentsTable } from './BalanceAdjustmentsTable'
import type { BalanceAdjustment } from '../api/models'

function makeBalanceAdjustment(
  overrides: Partial<BalanceAdjustment> = {},
): BalanceAdjustment {
  return {
    accountId: overrides.accountId ?? 'acct-1',
    accountName: overrides.accountName ?? 'Checking',
    flowDirection: overrides.flowDirection ?? 'inflow',
    currency: overrides.currency ?? 'USD',
    deltaAmount: overrides.deltaAmount ?? 7500,
    startBalance: overrides.startBalance ?? {
      amount: 10000,
      currency: 'USD',
    },
    endBalance: overrides.endBalance ?? {
      amount: 17500,
      currency: 'USD',
    },
  }
}

function renderTable(data: Array<BalanceAdjustment>) {
  return render(
    <MantineProvider>
      <BalanceAdjustmentsTable data={data} />
    </MantineProvider>,
  )
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

  Object.defineProperty(window, 'ResizeObserver', {
    value: vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BalanceAdjustmentsTable', () => {
  it('renders account-level adjustment columns and balances', () => {
    renderTable([makeBalanceAdjustment()])

    expect(screen.getAllByText('Account').length).toBeGreaterThan(0)
    expect(screen.getByText('Start Balance')).toBeTruthy()
    expect(screen.getByText('End Balance')).toBeTruthy()
    expect(screen.getByText('Adjustment')).toBeTruthy()
    expect(screen.getByText('Checking')).toBeTruthy()
    expect(screen.getByText('$100.00')).toBeTruthy()
    expect(screen.getByText('$175.00')).toBeTruthy()
    expect(screen.getByText('$75.00')).toBeTruthy()
  })

  it('does not crash when given an empty adjustment list', () => {
    renderTable([])

    expect(screen.getAllByText('Account').length).toBeGreaterThan(0)
    expect(screen.queryByText('Checking')).toBeNull()
  })

  it('renders the balance headers as non-sortable labels', () => {
    renderTable([makeBalanceAdjustment()])

    expect(screen.queryByRole('button', { name: 'Start Balance' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'End Balance' })).toBeNull()
  })

  it('renders a mobile list instead of table columns on narrow screens', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation(() => ({
        matches: true,
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

    renderTable([makeBalanceAdjustment()])

    expect(
      screen.getByLabelText('Balance adjustments list, 1 total'),
    ).toBeTruthy()
    expect(screen.queryByText('Start Balance')).toBeNull()
    expect(screen.getByText('Start $100.00')).toBeTruthy()
    expect(screen.getByText('End $175.00')).toBeTruthy()
  })
})
