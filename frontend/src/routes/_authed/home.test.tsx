import { MantineProvider } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../../api/models'
import { HomePage } from '../../components/pages/HomePage'
import {
  HOME_BALANCES_HIDDEN_STORAGE_KEY,
  PresentationProvider,
} from '../../lib/presentation-preferences'
import type * as SessionModule from '../../lib/session'
import type { DashboardData } from '../../lib/balance-utils'
import type * as ReactRouter from '@tanstack/react-router'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type * as BalanceDataHook from '../../hooks/useBalanceData'
import { TimePeriod } from '@/lib/types'

const mockFns = vi.hoisted(() => ({
  useNavigateMock: vi.fn(),
  useSearchMock: vi.fn(),
  useUserControllerMeMock: vi.fn(),
  useBalanceDataMock: vi.fn(),
  accountModalMock: vi.fn(),
}))

vi.mock('../../lib/session', async () => ({
  ...(await vi.importActual<typeof SessionModule>('../../lib/session')),
  useCurrentUser: mockFns.useUserControllerMeMock,
}))

vi.mock('@tanstack/react-router', async () => {
  const actual: typeof ReactRouter = await vi.importActual(
    '@tanstack/react-router',
  )

  return {
    ...actual,
    createFileRoute: () => (config: Record<string, unknown>) => ({
      ...config,
      useSearch: mockFns.useSearchMock,
    }),
    useNavigate: mockFns.useNavigateMock,
  }
})

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useUserControllerMe: mockFns.useUserControllerMeMock,
  }
})

vi.mock('../../hooks/useBalanceData', async () => {
  const actual: typeof BalanceDataHook = await vi.importActual(
    '../../hooks/useBalanceData',
  )

  return {
    ...actual,
    useBalanceData: mockFns.useBalanceDataMock,
  }
})

vi.mock('../../components/AccountModal', () => ({
  AccountModal: (props: unknown) => {
    mockFns.accountModalMock(props)
    return null
  },
}))

function createMoney(amount: number, currency = 'USD') {
  return {
    money: {
      amount: Math.round(Math.abs(amount) * 100),
      currency,
    },
    sign: amount < 0 ? MoneyWithSignSign.negative : MoneyWithSignSign.positive,
  }
}

function installMockLocalStorage() {
  const store = new Map<string, string>()

  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
      }),
      clear: vi.fn(() => {
        store.clear()
      }),
    },
    configurable: true,
  })
}

const dashboard: DashboardData = {
  netWorth: createMoney(1000),
  changePercent: 10,
  changeAmount: createMoney(100),
  comparisonPeriod: TimePeriod.month,
  chartData: [],
  assets: [
    {
      id: 'asset-1',
      name: 'Cash',
      type: AccountType.depository,
      valuationMode: 'balance',
      effectiveBalance: createMoney(600),
      changePercent: 5,
      changeAmount: createMoney(50),
      institutionName: 'Bank',
    },
    {
      id: 'asset-2',
      name: 'Brokerage',
      type: AccountType.investment,
      valuationMode: 'balance',
      effectiveBalance: createMoney(450, 'EUR'),
      convertedEffectiveBalance: createMoney(500),
      changePercent: -2,
      changeAmount: createMoney(-10),
      institutionName: 'Broker',
    },
  ],
  liabilities: [
    {
      id: 'liability-1',
      name: 'Card',
      type: AccountType.credit,
      valuationMode: 'balance',
      effectiveBalance: createMoney(-100),
      changePercent: -1,
      changeAmount: createMoney(-1),
      institutionName: 'Card Co',
    },
  ],
}

function renderHomePage() {
  return render(
    <MantineProvider>
      <PresentationProvider
        initial={{
          theme: 'splice-dark',
          maskBalances: null,
          today: '2026-09-05',
        }}
      >
        <HomePage {...mockFns.useSearchMock()} />
      </PresentationProvider>
    </MantineProvider>,
  )
}

beforeEach(() => {
  installMockLocalStorage()

  mockFns.useNavigateMock.mockReturnValue(vi.fn())
  mockFns.useSearchMock.mockReturnValue({
    accountId: undefined,
    period: TimePeriod.month,
  })
  mockFns.useUserControllerMeMock.mockReturnValue({
    data: {
      settings: {
        hideZeroBalanceAccounts: false,
      },
    },
  })
  mockFns.useBalanceDataMock.mockReturnValue({
    data: dashboard,
    isLoading: false,
    error: null,
  })

  window.localStorage.clear()

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
  window.localStorage.clear()
})

describe('HomePage balance visibility', () => {
  it('reads the browser preference and only masks balance amounts', () => {
    window.localStorage.setItem(HOME_BALANCES_HIDDEN_STORAGE_KEY, 'true')

    renderHomePage()

    expect(screen.getByRole('button', { name: /show balances/i })).toBeTruthy()
    expect(screen.getByText('Cash')).toBeTruthy()
    expect(screen.getByText('Brokerage')).toBeTruthy()
    expect(screen.getByText('Card')).toBeTruthy()

    expect(screen.queryByText('$1,000.00')).toBeNull()
    expect(screen.queryByText('$600.00')).toBeNull()
    expect(screen.queryByText('$500.00')).toBeNull()
    expect(screen.queryByText(/\(EUR\)/)).toBeNull()
    expect(screen.getAllByText('****').length).toBeGreaterThan(1)

    expect(screen.getByText('+10.00%')).toBeTruthy()
    expect(screen.getByText('from last month')).toBeTruthy()
    expect(screen.getByText('+5.00%')).toBeTruthy()
    expect(screen.getByText('-2.00%')).toBeTruthy()
    expect(screen.getByText('-1.00%')).toBeTruthy()
    expect(screen.getByText('54.5%')).toBeTruthy()
    expect(screen.getByText('45.5%')).toBeTruthy()
  })

  it('reveals absolute change when tapping an account percentage', async () => {
    renderHomePage()

    fireEvent.click(screen.getByText('+5.00%'))

    expect(await screen.findByText('+$50.00')).toBeTruthy()
  })

  it('updates localStorage when the toggle is used', () => {
    window.localStorage.setItem(HOME_BALANCES_HIDDEN_STORAGE_KEY, 'true')

    renderHomePage()

    fireEvent.click(screen.getByRole('button', { name: /show balances/i }))

    expect(window.localStorage.getItem(HOME_BALANCES_HIDDEN_STORAGE_KEY)).toBe(
      'false',
    )
    expect(screen.getByRole('button', { name: /hide balances/i })).toBeTruthy()
    expect(screen.getByText('$1,000.00')).toBeTruthy()
    expect(screen.getByText('$600.00')).toBeTruthy()
    expect(screen.getByText('$500.00')).toBeTruthy()
  })

  it('passes hidden balance preference into the account modal opened by URL', async () => {
    mockFns.useSearchMock.mockReturnValue({ accountId: dashboard.assets[0].id })
    window.localStorage.setItem(HOME_BALANCES_HIDDEN_STORAGE_KEY, 'true')

    renderHomePage()

    await waitFor(() =>
      expect(mockFns.accountModalMock).toHaveBeenCalledWith(
        expect.objectContaining({ balancesHidden: true, opened: true }),
      ),
    )
  })

  it('does not mount the unopened account modal', () => {
    renderHomePage()
    expect(mockFns.accountModalMock).not.toHaveBeenCalled()
  })

  it('does not show archived accounts in dashboard account sections', () => {
    mockFns.useBalanceDataMock.mockReturnValue({
      data: {
        ...dashboard,
        assets: [
          ...dashboard.assets,
          {
            id: 'archived-asset',
            name: 'Closed Checking',
            type: AccountType.depository,
            effectiveBalance: createMoney(0),
            institutionName: 'Old Bank',
            archivedAt: '2026-04-05T12:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    renderHomePage()

    expect(screen.getByText('Cash')).toBeTruthy()
    expect(screen.queryByText('Closed Checking')).toBeNull()
  })
})

it('offers a retry while keeping matching cached dashboard data visible', () => {
  const refetch = vi.fn()
  mockFns.useBalanceDataMock.mockReturnValue({
    data: dashboard,
    isLoading: false,
    error: new Error('Offline'),
    refetch,
  })
  renderHomePage()
  expect(
    screen.getByText('Previously loaded results are shown below.', {
      exact: false,
    }),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' }))
  expect(refetch).toHaveBeenCalledOnce()
})
