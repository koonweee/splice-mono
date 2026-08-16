import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InvestmentHoldingSnapshotProvider,
  InvestmentSecurityProvider,
} from '../../api/models'
import { ManualBrokerageHoldingsModal } from './ManualBrokerageHoldingsModal'
import type { InvestmentHoldingSnapshot } from '../../api/models'

const holding: InvestmentHoldingSnapshot = {
  id: 'holding-id',
  userId: 'user-id',
  accountId: 'account-id',
  securityId: 'security-id',
  provider: InvestmentHoldingSnapshotProvider.plaid,
  snapshotDate: '2026-08-16',
  quantity: '2.5',
  costBasis: null,
  institutionPrice: '200',
  institutionPriceAsOf: '2026-08-16',
  institutionPriceDatetime: '2026-08-16T20:00:00.000Z',
  institutionValue: '500',
  isoCurrencyCode: 'USD',
  unofficialCurrencyCode: null,
  accountCurrency: 'USD',
  exchangeRateToAccountCurrency: '1',
  accountValue: '500',
  vestedQuantity: null,
  vestedValue: null,
  createdAt: '2026-08-16T20:00:00.000Z',
  updatedAt: '2026-08-16T20:00:00.000Z',
  security: {
    id: 'security-id',
    userId: 'user-id',
    provider: InvestmentSecurityProvider.plaid,
    externalSecurityId: 'GOOGL',
    institutionId: null,
    institutionSecurityId: null,
    name: 'Alphabet Inc.',
    tickerSymbol: 'GOOGL',
    isin: null,
    cusip: null,
    sedol: null,
    type: 'EQUITY',
    subtype: null,
    isCashEquivalent: false,
    closePrice: '200',
    closePriceAsOf: '2026-08-16',
    updateDatetime: '2026-08-16T20:00:00.000Z',
    isoCurrencyCode: 'USD',
    unofficialCurrencyCode: null,
    marketIdentifierCode: 'XNAS',
    sector: null,
    industry: null,
    createdAt: '2026-08-16T20:00:00.000Z',
    updatedAt: '2026-08-16T20:00:00.000Z',
  },
}

function renderModal(options: {
  holdings?: Array<InvestmentHoldingSnapshot>
  saveHoldings?: ReturnType<typeof vi.fn>
  onSaved?: ReturnType<typeof vi.fn>
}) {
  const saveHoldings =
    options.saveHoldings ??
    vi.fn().mockResolvedValue({ staleSymbols: [] as Array<string> })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ManualBrokerageHoldingsModal
          accountId="account-id"
          holdings={options.holdings ?? [holding]}
          onClose={vi.fn()}
          onSaved={options.onSaved}
          opened
          saveHoldings={saveHoldings}
          searchSecurities={vi.fn().mockResolvedValue([])}
        />
      </MantineProvider>
    </QueryClientProvider>,
  )
  return saveHoldings
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ManualBrokerageHoldingsModal', () => {
  it('removes storage padding from whole and fractional share quantities', () => {
    renderModal({
      holdings: [
        { ...holding, quantity: '97.000000000000' },
        {
          ...holding,
          id: 'holding-id-2',
          securityId: 'security-id-2',
          quantity: '2.500000000000',
          security: {
            ...holding.security,
            id: 'security-id-2',
            externalSecurityId: 'NVDA',
            tickerSymbol: 'NVDA',
          },
        },
      ],
    })

    expect(screen.getByLabelText<HTMLInputElement>('GOOGL quantity').value).toBe(
      '97',
    )
    expect(screen.getByLabelText<HTMLInputElement>('NVDA quantity').value).toBe(
      '2.5',
    )
  })

  it('submits a full replacement with decimal quantities', async () => {
    const saveHoldings = renderModal({})

    fireEvent.change(screen.getByLabelText('GOOGL quantity'), {
      target: { value: '3.125' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save holdings' }))

    await waitFor(() =>
      expect(saveHoldings).toHaveBeenCalledWith([
        { symbol: 'GOOGL', quantity: '3.125' },
      ]),
    )
  })

  it('allows clearing the complete brokerage snapshot', async () => {
    const saveHoldings = renderModal({})

    fireEvent.click(screen.getByRole('button', { name: 'Remove GOOGL' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save holdings' }))

    await waitFor(() => expect(saveHoldings).toHaveBeenCalledWith([]))
  })

  it('keeps the modal open and shows an actionable valuation error', async () => {
    const saveHoldings = vi.fn().mockRejectedValue({
      response: { data: { message: 'C6L.SI has no usable quote.' } },
    })
    renderModal({ saveHoldings })

    fireEvent.click(screen.getByRole('button', { name: 'Save holdings' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'C6L.SI has no usable quote.',
    )
    expect(screen.getByRole('button', { name: 'Save holdings' })).toBeTruthy()
  })

  it('reports cached symbols after a successful save', async () => {
    const onSaved = vi.fn()
    renderModal({
      onSaved,
      saveHoldings: vi.fn().mockResolvedValue({ staleSymbols: ['C6L.SI'] }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save holdings' }))

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ staleSymbols: ['C6L.SI'] }),
    )
  })

  it('preserves a draft across refetches but resets it for a different account', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const saveHoldings = vi.fn().mockResolvedValue({ staleSymbols: [] })
    const searchSecurities = vi.fn().mockResolvedValue([])
    const renderContent = (
      holdings: Array<InvestmentHoldingSnapshot>,
      accountId = 'account-id',
    ) => (
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <ManualBrokerageHoldingsModal
            accountId={accountId}
            holdings={holdings}
            onClose={vi.fn()}
            opened
            saveHoldings={saveHoldings}
            searchSecurities={searchSecurities}
          />
        </MantineProvider>
      </QueryClientProvider>
    )
    const result = render(renderContent([holding]))

    fireEvent.change(screen.getByLabelText('GOOGL quantity'), {
      target: { value: '3.125' },
    })
    result.rerender(
      renderContent([
        { ...holding, quantity: '99', updatedAt: '2026-08-16T21:00:00.000Z' },
      ]),
    )

    expect(screen.getByLabelText<HTMLInputElement>('GOOGL quantity').value).toBe(
      '3.125',
    )

    result.rerender(
      renderContent(
        [{ ...holding, quantity: '99', accountId: 'account-id-2' }],
        'account-id-2',
      ),
    )
    expect(screen.getByLabelText<HTMLInputElement>('GOOGL quantity').value).toBe(
      '99',
    )
  })
})
