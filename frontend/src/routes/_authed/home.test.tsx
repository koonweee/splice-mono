import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../../api/models'
import type { DashboardData } from '../../lib/balance-utils'
import { HOME_BALANCES_HIDDEN_STORAGE_KEY, HomePage } from './home'
import { TimePeriod } from '@/lib/types'
import type * as ReactRouter from '@tanstack/react-router'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type * as BalanceDataHook from '../../hooks/useBalanceData'

const mockFns = vi.hoisted(() => ({
  useNavigateMock: vi.fn(),
  useSearchMock: vi.fn(),
  useUserControllerMeMock: vi.fn(),
  useBalanceDataMock: vi.fn(),
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
  AccountModal: () => null,
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

const dashboard: DashboardData = {
  netWorth: createMoney(1000),
  changePercent: 10,
  comparisonPeriod: TimePeriod.month,
  chartData: [],
  assets: [
    {
      id: 'asset-1',
      name: 'Cash',
      type: AccountType.depository,
      effectiveBalance: createMoney(600),
      changePercent: 5,
      institutionName: 'Bank',
    },
    {
      id: 'asset-2',
      name: 'Brokerage',
      type: AccountType.investment,
      effectiveBalance: createMoney(450, 'EUR'),
      convertedEffectiveBalance: createMoney(500),
      changePercent: -2,
      institutionName: 'Broker',
    },
  ],
  liabilities: [
    {
      id: 'liability-1',
      name: 'Card',
      type: AccountType.credit,
      effectiveBalance: createMoney(-100),
      changePercent: -1,
      institutionName: 'Card Co',
    },
  ],
}

function renderHomePage() {
  return render(
    <MantineProvider>
      <HomePage />
    </MantineProvider>,
  )
}

beforeEach(() => {
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

    expect(screen.getByText('+10.00% from last month')).toBeTruthy()
    expect(screen.getByText('+5.00%')).toBeTruthy()
    expect(screen.getByText('-2.00%')).toBeTruthy()
    expect(screen.getByText('-1.00%')).toBeTruthy()
    expect(screen.getByText('54.5%')).toBeTruthy()
    expect(screen.getByText('45.5%')).toBeTruthy()
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
})
