import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InvestmentHoldingSnapshotProvider,
  InvestmentSecurityProvider,
} from '../../api/models'
import { InvestmentHoldingsTable } from './InvestmentHoldingsTable'
import type { ComponentProps } from 'react'
import type { InvestmentHoldingSnapshot } from '../../api/models'

const holding: InvestmentHoldingSnapshot = {
  id: 'holding-id',
  userId: 'user-id',
  accountId: 'account-id',
  securityId: 'security-id',
  provider: InvestmentHoldingSnapshotProvider.plaid,
  snapshotDate: '2026-05-20',
  quantity: '10.123456',
  costBasis: '1000',
  institutionPrice: '120.25',
  institutionPriceAsOf: '2026-05-20',
  institutionPriceDatetime: '2026-05-20T21:00:00Z',
  institutionValue: '1217.345678',
  isoCurrencyCode: 'USD',
  unofficialCurrencyCode: null,
  accountCurrency: null,
  exchangeRateToAccountCurrency: null,
  accountValue: null,
  vestedQuantity: null,
  vestedValue: null,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
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
}

function createHolding(
  overrides: Partial<InvestmentHoldingSnapshot> = {},
): InvestmentHoldingSnapshot {
  return {
    ...holding,
    ...overrides,
    security: {
      ...holding.security,
      ...overrides.security,
    },
  }
}

function renderTable(
  props: Partial<ComponentProps<typeof InvestmentHoldingsTable>> = {},
) {
  return render(
    <MantineProvider>
      <InvestmentHoldingsTable
        holdings={[holding]}
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

describe('InvestmentHoldingsTable', () => {
  it('renders holding security, ticker, quantity, price, and value', () => {
    renderTable()

    expect(screen.getByText('Vanguard FTSE All-World UCITS ETF')).toBeTruthy()
    expect(screen.getByText('VWRA')).toBeTruthy()
    expect(screen.getByText('10.123456')).toBeTruthy()
    expect(screen.getByText('$120.25')).toBeTruthy()
    expect(screen.getByText('$1,217.35')).toBeTruthy()
    expect(screen.queryByText('Account value')).toBeNull()
  })

  it('masks monetary values without hiding ticker or quantity', () => {
    renderTable({ balancesHidden: true })

    expect(screen.getByText('VWRA')).toBeTruthy()
    expect(screen.getByText('10.123456')).toBeTruthy()
    expect(screen.getAllByText('****')).toHaveLength(2)
  })

  it('preserves fractional quotes while rounding holding values to currency precision', () => {
    renderTable({
      holdings: [
        createHolding({
          institutionPrice: '120.1234',
          institutionValue: '1217.345678',
        }),
      ],
    })

    expect(screen.getByText('$120.1234')).toBeTruthy()
    expect(screen.getByText('$1,217.35')).toBeTruthy()
  })

  it('renders an empty state', () => {
    renderTable({ holdings: [] })

    expect(screen.getByText('No holdings found.')).toBeTruthy()
  })

  it('handles cash-equivalent holdings without a ticker', () => {
    renderTable({
      holdings: [
        createHolding({
          id: 'cash-holding-id',
          quantity: null,
          institutionPrice: null,
          institutionValue: '100.5',
          security: {
            ...holding.security,
            id: 'cash-security-id',
            name: 'Cash',
            tickerSymbol: null,
            type: 'cash',
            isCashEquivalent: true,
          },
        }),
      ],
    })

    expect(screen.getByText('Cash')).toBeTruthy()
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('$100.50')).toBeTruthy()
  })

  it('formats holdings in multiple currencies', () => {
    renderTable({
      holdings: [
        holding,
        createHolding({
          id: 'eur-holding-id',
          securityId: 'eur-security-id',
          institutionPrice: '5',
          institutionValue: '500',
          isoCurrencyCode: 'EUR',
          security: {
            ...holding.security,
            id: 'eur-security-id',
            name: 'Euro Fund',
            tickerSymbol: 'EURO',
            isoCurrencyCode: 'EUR',
          },
        }),
      ],
    })

    expect(screen.getByText('$120.25')).toBeTruthy()
    expect(screen.getByText('€5.00')).toBeTruthy()
    expect(screen.getByText('€500.00')).toBeTruthy()
  })

  it('shows the native value without a separate account-value column', () => {
    renderTable({
      accountCurrency: 'USD',
      holdings: [
        createHolding({
          id: 'sgd-holding-id',
          securityId: 'sgd-security-id',
          quantity: '200',
          institutionPrice: '7.05',
          institutionPriceDatetime: null,
          institutionValue: '1410',
          isoCurrencyCode: 'SGD',
          accountCurrency: 'USD',
          exchangeRateToAccountCurrency: '0.78',
          accountValue: '1099.8',
          security: {
            ...holding.security,
            id: 'sgd-security-id',
            name: 'Singapore Airlines Limited',
            tickerSymbol: 'C6L.SI',
            isoCurrencyCode: 'SGD',
            marketIdentifierCode: 'XSES',
          },
        }),
      ],
    })

    expect(screen.queryByText('Account value')).toBeNull()
    expect(screen.getByText(/SGD\s+1,410\.00/)).toBeTruthy()
    expect(screen.queryByText('$1,099.80')).toBeNull()
    expect(screen.getByText('XSES · Price as of May 20, 2026')).toBeTruthy()
  })

  it('masks native and normalized values for cross-currency holdings', () => {
    renderTable({
      accountCurrency: 'USD',
      balancesHidden: true,
      holdings: [
        createHolding({
          isoCurrencyCode: 'SGD',
          accountCurrency: 'USD',
          exchangeRateToAccountCurrency: '0.78',
          accountValue: '949.53',
        }),
      ],
    })

    expect(screen.getAllByText('****')).toHaveLength(2)
  })

  it('renders the normalized holding layout at a mobile width', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })

    renderTable({
      accountCurrency: 'USD',
      holdings: [
        createHolding({
          quantity: '200',
          institutionPrice: '7.0512',
          institutionValue: '1410',
          isoCurrencyCode: 'SGD',
          accountCurrency: 'USD',
          exchangeRateToAccountCurrency: '0.78',
          accountValue: '1099.8',
        }),
      ],
    })

    expect(
      screen.getByLabelText('Investment holdings list, 1 total'),
    ).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(/SGD\s+7\.0512/)).toBeTruthy()
    expect(screen.getByText(/SGD\s+1,410\.00/)).toBeTruthy()
    expect(screen.getByText('$1,099.80')).toBeTruthy()
  })
})
