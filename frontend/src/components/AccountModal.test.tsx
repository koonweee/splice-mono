import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../api/models'
import { TimePeriod } from '../lib/types'
import { AccountModal } from './AccountModal'
import type { Account, AccountBalanceResult } from '../api/models'
import type { AccountSummaryData } from '../lib/balance-utils'
import type * as BalanceDataHook from '../hooks/useBalanceData'
import type * as SpliceAPI from '../api/clients/spliceAPI'

const mockFns = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  useAccountBalanceHistoryMock: vi.fn(),
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

function createAccount(notes: string | null): Account {
  return {
    id: 'account-id',
    userId: 'user-id',
    name: 'Checking',
    customName: null,
    notes,
    mask: null,
    availableBalance: createMoney(10000),
    currentBalance: createMoney(10000),
    type: AccountType.depository,
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

function renderAccountModal(notes: string | null) {
  const account = createAccount(notes)

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

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <AccountModal
          account={accountSummary}
          opened
          onClose={vi.fn()}
          period={TimePeriod.month}
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
