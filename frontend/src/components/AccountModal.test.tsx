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
  refetchBalanceHistoryMock: vi.fn(),
  useAccountBalanceHistoryMock: vi.fn(),
  useInvestmentHoldingsMock: vi.fn(),
  useInvestmentActivityMock: vi.fn(),
  investmentActivityTableMock: vi.fn(),
  useAccountControllerUpdateMock: vi.fn(),
  updateBalanceMutateMock: vi.fn(),
  notificationsShowMock: vi.fn(),
  refreshPricesMutateMock: vi.fn(),
  replaceHoldingsMutateAsyncMock: vi.fn(),
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

vi.mock('../hooks/useInvestmentActivity', () => ({
  useInvestmentActivity: mockFns.useInvestmentActivityMock,
}))

vi.mock('./investments/InvestmentActivityTable', () => ({
  InvestmentActivityTable: (props: {
    activity: Array<{ id: string }>
    total: number
  }) => {
    mockFns.investmentActivityTableMock(props)
    return props.activity.length === 0 ? (
      <div>No investment activity found.</div>
    ) : (
      <div data-testid="investment-activity-table" />
    )
  },
}))

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
    useAccountControllerUpdateBalance: () => ({
      mutate: mockFns.updateBalanceMutateMock,
      isPending: false,
    }),
    investmentControllerSearchSecurities: vi.fn(),
    useInvestmentControllerRefreshManualBrokeragePrices: () => ({
      mutate: mockFns.refreshPricesMutateMock,
      isPending: false,
    }),
    useInvestmentControllerReplaceManualBrokerageHoldings: () => ({
      mutateAsync: mockFns.replaceHoldingsMutateAsyncMock,
    }),
  }
})

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: mockFns.notificationsShowMock,
  },
}))

function createMoney(amount: number, currency = 'USD') {
  return {
    money: { amount, currency },
    sign: MoneyWithSignSign.positive,
  }
}

const accountSummary: AccountSummaryData = {
  id: 'account-id',
  name: 'Checking',
  customName: null,
  type: AccountType.depository,
  valuationMode: 'balance',
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
  valuationMode: 'balance' | 'holdings' = 'balance',
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
    valuationMode,
    subType: null,
    externalAccountId: null,
    bankLinkId: valuationMode === 'holdings' ? null : 'bank-link-id',
    bankLink: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  }
}

function createLatestBalance(
  account: Account,
  reportingCurrency?: string,
  snapshotBalanceAmount?: number,
): AccountBalanceResult {
  const snapshotCurrentBalance =
    snapshotBalanceAmount === undefined
      ? account.currentBalance
      : {
          ...account.currentBalance,
          money: {
            ...account.currentBalance.money,
            amount: snapshotBalanceAmount,
          },
        }
  const balance = {
    balance: snapshotCurrentBalance,
    convertedBalance:
      reportingCurrency &&
      reportingCurrency !== snapshotCurrentBalance.money.currency
        ? createMoney(7500, reportingCurrency)
        : undefined,
  }

  return {
    account,
    availableBalance: balance,
    currentBalance: balance,
    effectiveBalance: balance,
  }
}

function createBalanceHistoryHookState(
  account: Account,
  error: Error | null = null,
  reportingCurrency?: string,
  snapshotBalanceAmount?: number,
) {
  return {
    data:
      error === null
        ? {
            chartData: [],
            latestBalance: createLatestBalance(
              account,
              reportingCurrency,
              snapshotBalanceAmount,
            ),
            latestSyncedAt: undefined,
            rawResults: [],
          }
        : {
            chartData: [],
            latestBalance: undefined,
            latestSyncedAt: undefined,
            rawResults: [],
          },
    isLoading: false,
    isFetching: false,
    isError: error !== null,
    error,
    refetch: mockFns.refetchBalanceHistoryMock,
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
    balanceHistoryError?: Error | null
    balanceHistoryEmpty?: boolean
    balanceHistoryLoading?: boolean
    investmentActivity?: Array<{ id: string }>
    investmentActivityTotal?: number
    hasMoreInvestmentActivity?: boolean
    loadMoreInvestmentActivity?: ReturnType<typeof vi.fn>
    investmentActivityLoading?: boolean
    investmentActivityLoadMoreError?: boolean
    investmentActivityInitialError?: boolean
    valuationMode?: 'balance' | 'holdings'
    manual?: boolean
    nativeCurrency?: string
    reportingCurrency?: string
    accountBalanceAmount?: number
    snapshotBalanceAmount?: number
  } = {},
) {
  const account = createAccount(
    notes,
    options.type,
    options.valuationMode ?? 'balance',
  )
  if (options.manual) {
    account.bankLinkId = null
  }
  if (options.nativeCurrency || options.accountBalanceAmount !== undefined) {
    const amount = options.accountBalanceAmount ?? 10000
    const currency = options.nativeCurrency ?? 'USD'
    account.availableBalance = createMoney(amount, currency)
    account.currentBalance = createMoney(amount, currency)
  }
  const summary = {
    ...accountSummary,
    type: options.type ?? AccountType.depository,
    valuationMode: options.valuationMode ?? 'balance',
  }

  const balanceHistoryState = createBalanceHistoryHookState(
    account,
    options.balanceHistoryError ?? null,
    options.reportingCurrency,
    options.snapshotBalanceAmount,
  )
  if (options.balanceHistoryEmpty) {
    balanceHistoryState.data = {
      chartData: [],
      latestBalance: undefined,
      latestSyncedAt: undefined,
      rawResults: [],
    }
  }
  balanceHistoryState.isLoading = options.balanceHistoryLoading ?? false
  mockFns.useAccountBalanceHistoryMock.mockReturnValue(balanceHistoryState)
  mockFns.useInvestmentHoldingsMock.mockReturnValue({
    holdings: options.holdings ?? [],
    snapshotDate: options.holdings?.length ? '2026-05-20' : null,
    accountCurrency: options.valuationMode === 'holdings' ? 'USD' : null,
    isLoading: options.holdingsLoading ?? false,
    isError: options.holdingsError ?? false,
  })
  mockFns.useInvestmentActivityMock.mockReturnValue({
    activity: options.investmentActivity ?? [],
    total: options.investmentActivityTotal ?? 0,
    hasMore: options.hasMoreInvestmentActivity ?? false,
    loadMore: options.loadMoreInvestmentActivity ?? vi.fn(),
    isLoadingMore: false,
    isLoading: options.investmentActivityLoading ?? false,
    isInitialError: options.investmentActivityInitialError ?? false,
    isLoadMoreError: options.investmentActivityLoadMoreError ?? false,
  })

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  let currentSummary = summary
  let modalOpened = true
  const renderModal = () => (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <AccountModal
          account={currentSummary}
          opened={modalOpened}
          onClose={vi.fn()}
          period={TimePeriod.month}
          balancesHidden={options.balancesHidden ?? false}
        />
      </MantineProvider>
    </QueryClientProvider>
  )
  const result = render(renderModal())

  return {
    ...result,
    queryClient,
    rerenderWithAccount: (nextAccount: AccountSummaryData) => {
      currentSummary = nextAccount
      result.rerender(renderModal())
    },
    setOpened: (nextOpened: boolean) => {
      modalOpened = nextOpened
      result.rerender(renderModal())
    },
    rerenderModal: () => result.rerender(renderModal()),
  }
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
  mockFns.refreshPricesMutateMock.mockImplementation((_variables, options) => {
    options?.onSuccess?.({ staleSymbols: [] })
  })
  mockFns.replaceHoldingsMutateAsyncMock.mockResolvedValue({
    staleSymbols: [],
  })
  mockFns.updateBalanceMutateMock.mockImplementation((_variables, options) => {
    options?.onSuccess?.()
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

describe('AccountModal balance history', () => {
  it('shows a loading state without flashing valid-empty content', () => {
    renderAccountModal(null, { balanceHistoryLoading: true })

    expect(
      screen.getByRole('status', { name: 'Loading account history' }),
    ).toBeTruthy()
    expect(
      screen.queryByText('No balance history is available for this account.'),
    ).toBeNull()
  })

  it('renders an intentional empty state after a successful empty response', () => {
    renderAccountModal(null, { balanceHistoryEmpty: true })

    expect(
      screen.getByText('No balance history is available for this account.'),
    ).toBeTruthy()
    expect(screen.queryByText('Unable to load account history')).toBeNull()
    expect(screen.queryByText('Current balance')).toBeNull()
  })

  it('recovers from a balance-history error after Retry', () => {
    const result = renderAccountModal(null, {
      balanceHistoryError: new Error('Balance request failed'),
    })

    expect(screen.getByText('Unable to load account history')).toBeTruthy()
    expect(screen.queryByText('Current balance')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mockFns.refetchBalanceHistoryMock).toHaveBeenCalledTimes(1)

    mockFns.useAccountBalanceHistoryMock.mockReturnValue({
      ...createBalanceHistoryHookState(
        createAccount(null),
        new Error('Balance request failed'),
      ),
      isFetching: true,
    })
    result.rerenderModal()

    expect(
      screen
        .getByRole('button', { name: 'Retry' })
        .getAttribute('data-loading'),
    ).toBe('true')

    mockFns.useAccountBalanceHistoryMock.mockReturnValue(
      createBalanceHistoryHookState(createAccount(null)),
    )
    result.rerenderModal()

    expect(screen.queryByText('Unable to load account history')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByText('Current balance')).toBeTruthy()
    expect(screen.getByLabelText('Account notes')).toBeTruthy()
  })

  it('edits a manual account balance inline and confirms the change', () => {
    renderAccountModal(null, { manual: true })

    fireEvent.click(screen.getByRole('button', { name: 'Edit balance' }))

    const input = screen.getByRole('textbox', { name: 'Current balance' })
    fireEvent.change(input, { target: { value: '25.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save balance' }))

    expect(mockFns.updateBalanceMutateMock).toHaveBeenCalledWith(
      {
        id: 'account-id',
        data: {
          balance: {
            money: { amount: 2550, currency: 'USD' },
            sign: MoneyWithSignSign.positive,
          },
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
    expect(screen.queryByRole('form', { name: 'Edit balance' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit balance' })).toBeTruthy()
  })

  it('cancels an inline balance edit without saving', () => {
    renderAccountModal(null, { manual: true })

    fireEvent.click(screen.getByRole('button', { name: 'Edit balance' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Current balance' }), {
      target: { value: '25.50' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel balance edit' }),
    )

    expect(mockFns.updateBalanceMutateMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('form', { name: 'Edit balance' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit balance' })).toBeTruthy()
  })

  it('keeps the reporting value visible while editing the native balance', () => {
    renderAccountModal(null, {
      manual: true,
      nativeCurrency: 'SGD',
      reportingCurrency: 'USD',
    })

    expect(screen.getByText('$75.00')).toBeTruthy()
    expect(screen.getByText('$100.00 (SGD)')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Edit balance' }))

    expect(screen.getByText('$75.00')).toBeTruthy()
    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Current balance',
    })
    expect(input.value).toBe('100.00 SGD')

    fireEvent.change(input, { target: { value: '125.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save balance' }))

    expect(mockFns.updateBalanceMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          balance: {
            money: { amount: 12500, currency: 'SGD' },
            sign: MoneyWithSignSign.positive,
          },
        },
      }),
      expect.any(Object),
    )
  })

  it('edits the same snapshot balance that is displayed', () => {
    renderAccountModal(null, {
      manual: true,
      accountBalanceAmount: 999900,
      snapshotBalanceAmount: 213340,
    })

    expect(screen.getByText('$2,133.40')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Edit balance' }))

    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Current balance',
    })
    expect(input.value).toContain('2133.40')
    expect(input.value).not.toContain('9999.00')
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
    expect(screen.getByText('Vanguard FTSE All-World UCITS ETF')).toBeTruthy()
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
    expect(screen.getByText('Current balance')).toBeTruthy()
  })

  it('shows investment activity loading without an empty-state flash', () => {
    renderAccountModal(null, {
      type: AccountType.investment,
      investmentActivityLoading: true,
    })

    expect(
      screen.getByRole('status', { name: 'Loading investment activity' }),
    ).toBeTruthy()
    expect(screen.queryByText('No investment activity found.')).toBeNull()
  })

  it('renders an intentional empty state after a successful empty response', () => {
    renderAccountModal(null, {
      type: AccountType.investment,
      investmentActivity: [],
      investmentActivityTotal: 0,
    })

    expect(screen.getByText('0 of 0')).toBeTruthy()
    expect(screen.getByText('No investment activity found.')).toBeTruthy()
    expect(
      screen.queryByText('Provider activity is unavailable or incomplete.'),
    ).toBeNull()
  })

  it('shows the loaded activity count and allows loading every reported row', () => {
    const loadMore = vi.fn()
    renderAccountModal(null, {
      type: AccountType.investment,
      investmentActivity: Array.from({ length: 10 }, (_, index) => ({
        id: `activity-${index}`,
      })),
      investmentActivityTotal: 25,
      hasMoreInvestmentActivity: true,
      loadMoreInvestmentActivity: loadMore,
    })

    expect(screen.getByText('10 of 25')).toBeTruthy()
    expect(mockFns.investmentActivityTableMock).toHaveBeenCalledWith(
      expect.objectContaining({ total: 25 }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load more activity' }))
    expect(loadMore).toHaveBeenCalledTimes(1)
  })

  it('keeps loaded rows visible and lets a failed next page be retried', () => {
    const retry = vi.fn()
    renderAccountModal(null, {
      type: AccountType.investment,
      investmentActivity: Array.from({ length: 10 }, (_, index) => ({
        id: `activity-${index}`,
      })),
      investmentActivityTotal: 25,
      hasMoreInvestmentActivity: true,
      loadMoreInvestmentActivity: retry,
      investmentActivityLoadMoreError: true,
    })

    expect(screen.getByText('10 of 25')).toBeTruthy()
    expect(screen.getByTestId('investment-activity-table')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      'Unable to load more provider activity.',
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Retry loading activity' }),
    )
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('uses holdings controls and suppresses provider activity for a manual brokerage', () => {
    renderAccountModal(null, {
      type: AccountType.investment,
      valuationMode: 'holdings',
      holdings: [investmentHolding],
    })

    expect(screen.getByRole('button', { name: 'Edit holdings' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh prices' })).toBeTruthy()
    expect(screen.getByText('(as of May 20, 2026)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit balance' })).toBeNull()
    expect(screen.queryByText('Activity')).toBeNull()
    expect(mockFns.useInvestmentActivityMock).toHaveBeenCalledWith(
      'account-id',
      false,
    )
  })

  it('waits for holdings to load before opening a populated editor', async () => {
    const result = renderAccountModal(null, {
      type: AccountType.investment,
      valuationMode: 'holdings',
      holdingsLoading: true,
    })
    const loadingEditButton = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Edit holdings',
    })

    expect(loadingEditButton.disabled).toBe(true)

    mockFns.useInvestmentHoldingsMock.mockReturnValue({
      holdings: [investmentHolding],
      snapshotDate: '2026-05-20',
      accountCurrency: 'USD',
      isLoading: false,
      isError: false,
    })
    result.rerenderModal()

    const loadedEditButton = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Edit holdings',
    })
    expect(loadedEditButton.disabled).toBe(false)

    fireEvent.click(loadedEditButton)

    const quantityInput =
      await screen.findByLabelText<HTMLInputElement>('VWRA quantity')
    expect(quantityInput.value).toBe('10')
  })

  it('refreshes a manual brokerage and reports cached symbols without zeroing it', () => {
    mockFns.refreshPricesMutateMock.mockImplementation(
      (_variables, options) => {
        options?.onSuccess?.({ staleSymbols: ['C6L.SI'] })
      },
    )
    renderAccountModal(null, {
      type: AccountType.investment,
      valuationMode: 'holdings',
      holdings: [investmentHolding],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }))

    expect(mockFns.refreshPricesMutateMock).toHaveBeenCalledWith(
      { accountId: 'account-id' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
    expect(screen.getByRole('status').textContent).toContain(
      'Using cached prices for C6L.SI',
    )
    expect(mockFns.notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'yellow' }),
    )
  })

  it('clears cached-price warnings when the selected account changes', async () => {
    mockFns.refreshPricesMutateMock.mockImplementation(
      (_variables, options) => {
        options?.onSuccess?.({ staleSymbols: ['C6L.SI'] })
      },
    )
    const result = renderAccountModal(null, {
      type: AccountType.investment,
      valuationMode: 'holdings',
      holdings: [investmentHolding],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }))
    expect(screen.getByRole('status').textContent).toContain('C6L.SI')

    result.rerenderWithAccount({
      ...accountSummary,
      id: 'account-id-2',
      type: AccountType.investment,
      valuationMode: 'holdings',
    })

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('clears cached-price warnings when the account modal reopens', async () => {
    mockFns.refreshPricesMutateMock.mockImplementation(
      (_variables, options) => {
        options?.onSuccess?.({ staleSymbols: ['C6L.SI'] })
      },
    )
    const result = renderAccountModal(null, {
      type: AccountType.investment,
      valuationMode: 'holdings',
      holdings: [investmentHolding],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }))
    expect(screen.getByRole('status').textContent).toContain('C6L.SI')

    result.setOpened(false)
    result.setOpened(true)

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('replaces edited holdings and invalidates account valuation queries', async () => {
    const { queryClient } = renderAccountModal(null, {
      type: AccountType.investment,
      valuationMode: 'holdings',
      holdings: [investmentHolding],
    })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    fireEvent.click(screen.getByRole('button', { name: 'Edit holdings' }))
    fireEvent.change(await screen.findByLabelText('VWRA quantity'), {
      target: { value: '12.5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save holdings' }))

    await waitFor(() =>
      expect(mockFns.replaceHoldingsMutateAsyncMock).toHaveBeenCalledWith({
        accountId: 'account-id',
        data: { positions: [{ symbol: 'VWRA', quantity: '12.5' }] },
      }),
    )
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['/investment/account/account-id/holdings/latest'],
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['/balance-query/balances'],
    })
  })
})
