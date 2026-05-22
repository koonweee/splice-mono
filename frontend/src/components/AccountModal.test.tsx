import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AccountType,
  InvestmentHoldingSnapshotProvider,
  InvestmentSecurityProvider,
  MoneyWithSignSign,
} from '../api/models'
import { TimePeriod } from '../lib/types'
import { AccountModal } from './AccountModal'
import type {
  Account,
  AccountBalanceResult,
  InvestmentHoldingSnapshot,
} from '../api/models'
import type { AccountSummaryData } from '../lib/balance-utils'
import type * as BalanceDataHook from '../hooks/useBalanceData'
import type * as InvestmentHoldingsHook from '../hooks/useInvestmentHoldings'
import type * as SpliceAPI from '../api/clients/spliceAPI'

const mockFns = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  useAccountBalanceHistoryMock: vi.fn(),
  useInvestmentHoldingsMock: vi.fn(),
  useAccountControllerUpdateMock: vi.fn(),
  notificationsShowMock: vi.fn(),
}))

vi.mock('../hooks/useBalanceData', async () => {
  const actual: typeof BalanceDataHook = await vi.importActual(
    '../hooks/useBalanceData',
  )

  return {
    ...actual,
    useAccountBalanceHistory: mockFns.useAccountBalanceHistoryMock,
  }
})

vi.mock('../hooks/useInvestmentHoldings', async () => {
  const actual: typeof InvestmentHoldingsHook = await vi.importActual(
    '../hooks/useInvestmentHoldings',
  )

  return {
    ...actual,
    useInvestmentHoldings: mockFns.useInvestmentHoldingsMock,
  }
})

vi.mock('../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../api/clients/spliceAPI',
  )

  return {
    ...actual,
    getAccountControllerFindAllQueryKey: () => ['/account'],
    getBalanceQueryControllerGetAllBalancesQueryKey: () => [
      '/balance-query/all-balances',
    ],
    getBalanceQueryControllerGetBalancesQueryKey: () => [
      '/balance-query/balances',
    ],
    useAccountControllerUpdate: mockFns.useAccountControllerUpdateMock,
  }
})

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: mockFns.notificationsShowMock,
  },
}))

function createMoney(amount: number) {
  return {
    money: { amount, currency: 'USD' },
    sign: MoneyWithSignSign.positive,
  }
}

const accountSummary: AccountSummaryData = {
  id: 'account-id',
  name: 'Checking',
  customName: null,
  type: AccountType.depository,
  effectiveBalance: createMoney(10000),
}

type AccountTypeValue = (typeof AccountType)[keyof typeof AccountType]

const investmentHolding: InvestmentHoldingSnapshot = {
  id: 'holding-id',
  userId: 'user-id',
  accountId: 'account-id',
  securityId: 'security-id',
  provider: InvestmentHoldingSnapshotProvider.plaid,
  snapshotDate: '2026-05-20',
  quantity: '10',
  costBasis: '1000',
  institutionPrice: '120.25',
  institutionPriceAsOf: '2026-05-20',
  institutionPriceDatetime: '2026-05-20T21:00:00Z',
  institutionValue: '1202.5',
  isoCurrencyCode: 'USD',
  unofficialCurrencyCode: null,
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
    isin: null,
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
    marketIdentifierCode: null,
    sector: null,
    industry: null,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  },
}

function createAccount(
  notes: string | null,
  type: AccountTypeValue = AccountType.depository,
): Account {
  return {
    id: 'account-id',
    userId: 'user-id',
    name: 'Checking',
    customName: null,
    notes,
    mask: null,
    availableBalance: createMoney(10000),
    currentBalance: createMoney(10000),
    type,
    subType: null,
    externalAccountId: null,
    bankLinkId: 'bank-link-id',
    bankLink: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  }
}

function createLatestBalance(account: Account): AccountBalanceResult {
  const balance = { balance: createMoney(10000) }

  return {
    account,
    availableBalance: balance,
    currentBalance: balance,
    effectiveBalance: balance,
  }
}

function renderAccountModal(
  notes: string | null,
  options: {
    type?: AccountTypeValue
    balancesHidden?: boolean
    holdings?: Array<InvestmentHoldingSnapshot>
    holdingsLoading?: boolean
    holdingsError?: boolean
  } = {},
) {
  const account = createAccount(notes, options.type)
  const summary = {
    ...accountSummary,
    type: options.type ?? AccountType.depository,
  }

  mockFns.useAccountBalanceHistoryMock.mockReturnValue({
    data: {
      chartData: [],
      latestBalance: createLatestBalance(account),
      latestSyncedAt: undefined,
      rawResults: [],
    },
    isLoading: false,
    error: null,
  })
  mockFns.useInvestmentHoldingsMock.mockReturnValue({
    holdings: options.holdings ?? [],
    snapshotDate: options.holdings?.length ? '2026-05-20' : null,
    isLoading: options.holdingsLoading ?? false,
    isError: options.holdingsError ?? false,
  })

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <AccountModal
          account={summary}
          opened
          onClose={vi.fn()}
          period={TimePeriod.month}
          balancesHidden={options.balancesHidden ?? false}
        />
      </MantineProvider>
    </QueryClientProvider>,
  )
}

function getTextarea(element: HTMLElement): HTMLTextAreaElement {
  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error('Expected element to be a textarea')
  }

  return element
}

beforeEach(() => {
  mockFns.useAccountControllerUpdateMock.mockReturnValue({
    mutate: mockFns.mutateMock,
    isPending: false,
  })
  mockFns.useInvestmentHoldingsMock.mockReturnValue({
    holdings: [],
    snapshotDate: null,
    isLoading: false,
    isError: false,
  })
  mockFns.mutateMock.mockImplementation(({ data }, options) => {
    options?.onSuccess?.({
      ...createAccount(data.notes ?? null),
      notes: data.notes ?? null,
    })
  })

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

describe('AccountModal notes', () => {
  it('renders an empty notes textarea with placeholder when notes are absent', () => {
    renderAccountModal(null)

    const textarea = getTextarea(
      screen.getByPlaceholderText('Enter notes here'),
    )

    expect(textarea.value).toBe('')
  })

  it('renders existing notes in the textarea', () => {
    renderAccountModal('Use for household bills.')

    const textarea = getTextarea(screen.getByLabelText('Account notes'))

    expect(textarea.value).toBe('Use for household bills.')
  })

  it('hides the save button until notes change', () => {
    renderAccountModal(null)

    expect(
      screen.queryByRole('button', { name: /save account notes/i }),
    ).toBeNull()

    fireEvent.change(screen.getByLabelText('Account notes'), {
      target: { value: 'New note' },
    })

    expect(
      screen.getByRole('button', { name: /save account notes/i }),
    ).toBeTruthy()
  })

  it('saves edited notes', () => {
    renderAccountModal(null)

    fireEvent.change(screen.getByLabelText('Account notes'), {
      target: { value: 'New note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save account notes/i }))

    expect(mockFns.mutateMock).toHaveBeenCalledWith(
      { id: 'account-id', data: { notes: 'New note' } },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })

  it('saves whitespace-only notes as null', () => {
    renderAccountModal('Old note')

    fireEvent.change(screen.getByLabelText('Account notes'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save account notes/i }))

    expect(mockFns.mutateMock).toHaveBeenCalledWith(
      { id: 'account-id', data: { notes: null } },
      expect.any(Object),
    )
  })
})

describe('AccountModal holdings', () => {
  it('fetches and renders holdings for investment accounts', () => {
    renderAccountModal(null, {
      type: AccountType.investment,
      holdings: [investmentHolding],
    })

    expect(mockFns.useInvestmentHoldingsMock).toHaveBeenCalledWith(
      'account-id',
      true,
    )
    expect(screen.getByText('Holdings')).toBeTruthy()
    expect(
      screen.getByText('Vanguard FTSE All-World UCITS ETF'),
    ).toBeTruthy()
    expect(screen.getByText('VWRA')).toBeTruthy()
  })

  it('does not enable holdings fetch for depository accounts', () => {
    renderAccountModal(null)

    expect(mockFns.useInvestmentHoldingsMock).toHaveBeenCalledWith(
      'account-id',
      false,
    )
    expect(screen.queryByText('Holdings')).toBeNull()
  })

  it('masks account and holding money values when balances are hidden', () => {
    renderAccountModal(null, {
      type: AccountType.investment,
      balancesHidden: true,
      holdings: [investmentHolding],
    })

    expect(screen.getByText('VWRA')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getAllByText('****').length).toBeGreaterThanOrEqual(3)
  })

  it('keeps balance history visible when holdings fail to load', () => {
    renderAccountModal(null, {
      type: AccountType.investment,
      holdingsError: true,
    })

    expect(screen.getByText('Holdings unavailable.')).toBeTruthy()
    expect(screen.getByText('Current Balance')).toBeTruthy()
  })
})
