import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalysisAuditDrawer } from './AnalysisAuditDrawer'
import type { ComponentProps } from 'react'
import type { TransactionAnalysisAuditResponse } from '../../api/models'

function mockBrowserLayout() {
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
      disconnect: vi.fn(),
      observe: vi.fn(),
      unobserve: vi.fn(),
    })),
    configurable: true,
  })
}

const auditResponse: TransactionAnalysisAuditResponse = {
  startDate: '2026-02-01',
  endDate: '2026-02-28',
  neutralizationLookaroundDays: 60,
  rows: [
    {
      id: 'excluded-row',
      type: 'excluded',
      groupKey: 'exclude:rule-1',
      groupLabel: 'Excluded by "Ignore reimbursements"',
      ruleId: 'rule-1',
      ruleName: 'Ignore reimbursements',
      transaction: {
        id: 'transaction-1',
        activityDate: '2026-02-04',
        merchantName: 'Payroll correction',
        originalDescription: null,
        accountName: 'Checking',
        categoryPrimary: 'Income',
        categoryDetailed: 'Paycheck',
        amount: { amount: 4200, currency: 'USD', sign: 'positive' },
      },
    },
    {
      id: 'neutralized-row',
      type: 'neutralized',
      groupKey: 'neutralize:rule-2',
      groupLabel: 'Neutralized by "Refunds"',
      ruleId: 'rule-2',
      ruleName: 'Refunds',
      outflow: {
        id: 'transaction-2',
        activityDate: '2026-02-10',
        merchantName: 'Store',
        originalDescription: null,
        accountName: 'Card',
        categoryPrimary: 'Shopping',
        categoryDetailed: 'Clothing',
        amount: { amount: 9900, currency: 'USD', sign: 'negative' },
      },
      inflow: {
        id: 'transaction-3',
        activityDate: '2026-03-01',
        merchantName: 'Store refund',
        originalDescription: null,
        accountName: 'Card',
        categoryPrimary: 'Shopping',
        categoryDetailed: 'Clothing',
        amount: { amount: 9900, currency: 'USD', sign: 'positive' },
      },
    },
  ],
}

beforeEach(() => {
  mockBrowserLayout()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('AnalysisAuditDrawer', () => {
  it('renders loading, error, and empty states inside the drawer', () => {
    const { rerender } = renderDrawer({
      auditQuery: { isLoading: true },
    })

    expect(screen.getByText('Analysis audit')).toBeTruthy()
    expect(
      screen.queryByText('No rule effects for this date range.'),
    ).toBeNull()

    rerender(
      <MantineProvider>
        <AnalysisAuditDrawer
          opened
          onClose={vi.fn()}
          startDate="2026-02-01"
          endDate="2026-02-28"
          auditQuery={{ isError: true }}
        />
      </MantineProvider>,
    )
    expect(screen.getByText('Failed to load analysis audit.')).toBeTruthy()

    rerender(
      <MantineProvider>
        <AnalysisAuditDrawer
          opened
          onClose={vi.fn()}
          startDate="2026-02-01"
          endDate="2026-02-28"
          auditQuery={{ data: { ...auditResponse, rows: [] } }}
        />
      </MantineProvider>,
    )
    expect(
      screen.getByText('No rule effects for this date range.'),
    ).toBeTruthy()
    expect(
      screen
        .getAllByRole('link', { name: /manage rules/i })[0]
        .getAttribute('href'),
    ).toBe('/settings?tab=analysis')
  })

  it('groups audit rows and renders excluded and neutralized details', () => {
    renderDrawer({
      auditQuery: { data: auditResponse },
    })

    expect(screen.getByText('Excluded by "Ignore reimbursements"')).toBeTruthy()
    expect(screen.getByText('Neutralized by "Refunds"')).toBeTruthy()
    expect(screen.getByText('Payroll correction')).toBeTruthy()
    expect(screen.getByText('Store')).toBeTruthy()
    expect(screen.getByText('Store refund')).toBeTruthy()
    expect(screen.getByText('Outflow')).toBeTruthy()
    expect(screen.getByText('Inflow')).toBeTruthy()
    expect(screen.getByText(/Refund matching window:\s*60 days/i)).toBeTruthy()
    expect(screen.getByText('Feb 1–28, 2026')).toBeTruthy()
    expect(screen.getByText(/Feb 4, 2026/)).toBeTruthy()
  })
})

function renderDrawer(
  props: Partial<ComponentProps<typeof AnalysisAuditDrawer>> = {},
) {
  return render(
    <MantineProvider>
      <AnalysisAuditDrawer
        opened
        onClose={vi.fn()}
        startDate="2026-02-01"
        endDate="2026-02-28"
        {...props}
      />
    </MantineProvider>,
  )
}
