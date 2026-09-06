import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InvestmentActivityProvider,
  InvestmentSecurityProvider,
  MoneyWithSignSign,
} from '../../api/models'
import { InvestmentActivityTable } from './InvestmentActivityTable'
import type { ComponentProps } from 'react'
import type { InvestmentActivity } from '../../api/models'

const activity: InvestmentActivity = {
  id: 'activity-id',
  activityId: 'account-activity-id',
  accountId: 'account-id',
  accountName: 'IBKR',
  provider: InvestmentActivityProvider.plaid,
  externalActivityId: 'external-activity-id',
  activityDate: '2026-05-20',
  providerDate: '2026-05-20',
  providerDatetime: null,
  amount: {
    money: { currency: 'USD', amount: '120025' },
    sign: MoneyWithSignSign.negative,
  },
  security: {
    id: 'security-id',
    userId: 'user-id',
    provider: InvestmentSecurityProvider.plaid,
    externalSecurityId: 'external-security-id',
    institutionId: 'ins_123',
    institutionSecurityId: null,
    name: 'Vanguard FTSE All-World UCITS ETF',
    tickerSymbol: 'VWRA',
    isin: 'IE00BK5BQT80',
    cusip: null,
    sedol: null,
    type: 'etf',
    subtype: 'etf',
    isCashEquivalent: false,
    closePrice: '120.25',
    closePriceAsOf: '2026-05-20',
    updateDatetime: '2026-05-20T21:00:00Z',
    isoCurrencyCode: 'USD',
    unofficialCurrencyCode: null,
    marketIdentifierCode: 'XLON',
    sector: null,
    industry: null,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  },
  externalSecurityId: 'external-security-id',
  name: 'Buy VWRA',
  providerDescription: 'Buy VWRA',
  quantity: '10',
  price: '120.25',
  fees: '1.25',
  investmentType: 'buy',
  investmentSubtype: 'buy',
  cancelExternalActivityId: null,
}

function renderTable(
  props: Partial<ComponentProps<typeof InvestmentActivityTable>> = {},
) {
  return render(
    <MantineProvider>
      <InvestmentActivityTable
        activity={[activity]}
        balancesHidden={false}
        {...props}
      />
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
})

describe('InvestmentActivityTable', () => {
  it('renders activity fields', () => {
    renderTable()

    expect(screen.getByText('May 20, 2026')).toBeTruthy()
    expect(screen.getByText('VWRA')).toBeTruthy()
    expect(screen.getByText('Buy')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getByText('$120.25')).toBeTruthy()
    expect(screen.getByText('$1.25')).toBeTruthy()
    expect(screen.getByText('-$1,200.25')).toBeTruthy()
  })

  it('uses the activity currency for prices and fees without dropping quote precision', () => {
    renderTable({
      activity: [
        {
          ...activity,
          price: '120.1234',
          fees: '1.1234',
          amount: {
            ...activity.amount,
            money: { currency: 'EUR', amount: '120025' },
          },
          investmentType: 'cash',
          investmentSubtype: 'deposit',
        },
      ],
    })

    expect(screen.getByText('€120.1234')).toBeTruthy()
    expect(screen.getByText('€1.1234')).toBeTruthy()
    expect(screen.getByText('-€1,200.25')).toBeTruthy()
    expect(screen.getByText('Deposit')).toBeTruthy()
    expect(screen.queryByText('Cash · Deposit')).toBeNull()
  })

  it('formats repeated and compound provider labels for people', () => {
    renderTable({
      activity: [
        { ...activity, investmentType: 'sell', investmentSubtype: 'sell' },
        {
          ...activity,
          id: 'reinvestment',
          investmentType: 'buy',
          investmentSubtype: 'dividend_reinvestment',
        },
      ],
    })

    expect(screen.getByText('Sell')).toBeTruthy()
    expect(screen.getByText('Buy · Dividend reinvestment')).toBeTruthy()
  })

  it('masks cash impact only', () => {
    renderTable({ balancesHidden: true })

    expect(screen.getByText('VWRA')).toBeTruthy()
    expect(screen.getByText('****')).toBeTruthy()
  })

  it('renders a valid empty state', () => {
    renderTable({ activity: [] })

    expect(screen.getByText('No investment activity found.')).toBeTruthy()
  })
})
