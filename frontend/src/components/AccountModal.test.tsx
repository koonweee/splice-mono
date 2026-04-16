import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountModal } from './AccountModal'
import type * as BalanceHooks from '../hooks/useBalanceData'
import type * as ManualInvestmentApi from '../api/manualInvestment'
import type { AccountBalanceHistoryResult } from '../hooks/useBalanceData'
import type { AccountBalanceResult, Account } from '../api/models'

const mockFns = vi.hoisted(() => ({
  useAccountBalanceHistoryMock: vi.fn(),
  useManualInvestmentSnapshotsMock: vi.fn(),
  useDeleteManualInvestmentSnapshotMock: vi.fn(),
}))

vi.mock('../hooks/useBalanceData', async () => {
  const actual: typeof BalanceHooks = await vi.importActual('../hooks/useBalanceData')

  return {
    ...actual,
    useAccountBalanceHistory: mockFns.useAccountBalanceHistoryMock,
  }
})

vi.mock('../api/manualInvestment', async () => {
  const actual: typeof ManualInvestmentApi = await vi.importActual(
    '../api/manualInvestment',
  )

  return {
    ...actual,
    useManualInvestmentSnapshots: mockFns.useManualInvestmentSnapshotsMock,
    useDeleteManualInvestmentSnapshot: mockFns.useDeleteManualInvestmentSnapshotMock,
  }
})

vi.mock('./Chart', () => ({
  Chart: () => <div data-testid="chart" />,
}))

vi.mock('./accounts/UpdateBalanceModal', () => ({
  UpdateBalanceModal: ({ opened }: { opened: boolean }) =>
    opened ? <div data-testid="update-balance-modal" /> : null,
}))

vi.mock('./accounts/UpdateHoldingsModal', () => ({
  UpdateHoldingsModal: ({ opened }: { opened: boolean }) =>
    opened ? <div data-testid="update-holdings-modal" /> : null,
}))

vi.mock('../lib/hooks', () => ({
  useIsMobile: () => false,
}))

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'account-1',
    userId: 'user-1',
    name: 'Brokerage',
    customName: null,
    availableBalance: {
      money: { amount: 0, currency: 'USD' },
      sign: 'positive',
    },
    currentBalance: {
      money: { amount: 10000, currency: 'USD' },
      sign: 'positive',
    },
    type: 'investment',
    subType: 'brokerage',
    externalAccountId: null,
    bankLinkId: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    manualValuationMode: 'holdings',
    lastUserSnapshotAt: '2026-04-15T00:00:00.000Z',
    lastValuationAt: '2026-04-16T00:00:00.000Z',
    ...overrides,
  }
}

function makeBalanceResult(account: Account): AccountBalanceResult {
  return {
    account,
    availableBalance: { balance: account.availableBalance },
    currentBalance: { balance: account.currentBalance },
    effectiveBalance: { balance: account.currentBalance },
    syncedAt: undefined,
  }
}

function renderModal() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <AccountModal
          opened
          onClose={() => {}}
          period={'month' as any}
          account={{
            id: 'account-1',
            name: 'Brokerage',
            type: 'investment' as any,
            effectiveBalance: {
              money: { amount: 10000, currency: 'USD' },
              sign: 'positive',
            },
          }}
        />
      </MantineProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  const fullAccount = makeAccount()
  const balanceHistory: AccountBalanceHistoryResult = {
    chartData: [],
    latestBalance: makeBalanceResult(fullAccount),
    latestSyncedAt: undefined,
    rawResults: [],
  }

  mockFns.useAccountBalanceHistoryMock.mockReturnValue({
    data: balanceHistory,
    isLoading: false,
  })
  mockFns.useManualInvestmentSnapshotsMock.mockReturnValue({
    data: [
      {
        id: 'snapshot-1',
        accountId: 'account-1',
        userId: 'user-1',
        snapshotDate: '2026-04-15',
        cashBalance: {
          money: { amount: 10000, currency: 'USD' },
          sign: 'positive',
        },
        holdings: [
          { id: 'holding-1', instrumentId: 'inst-1', symbol: 'VOO', quantity: 2 },
        ],
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z',
      },
    ],
  })
  mockFns.useDeleteManualInvestmentSnapshotMock.mockReturnValue({
    mutate: vi.fn(),
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
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AccountModal', () => {
  it('shows holdings-specific controls and opens the holdings editor for holdings-mode manual accounts', () => {
    renderModal()

    expect(screen.getByText('Holdings snapshots')).toBeTruthy()
    expect(screen.queryByText('Last synced')).toBeNull()
    expect(screen.getByRole('button', { name: 'Update Holdings' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Update Holdings' }))

    expect(screen.getByTestId('update-holdings-modal')).toBeTruthy()
    expect(screen.queryByTestId('update-balance-modal')).toBeNull()
  })
})
