import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../../api/models'
import { AccountRow } from './AccountRow'
import type * as ReactQuery from '@tanstack/react-query'
import type { Account } from '../../api/models'

const mockFns = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(),
  archiveMutateMock: vi.fn(),
  useAccountControllerUpdateMock: vi.fn(),
  useBankLinkControllerInitiateLinkingMock: vi.fn(),
  notificationsShowMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual: typeof ReactQuery = await vi.importActual(
    '@tanstack/react-query',
  )

  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockFns.invalidateQueriesMock,
    }),
    useMutation: () => ({
      mutate: mockFns.archiveMutateMock,
      isPending: false,
    }),
  }
})

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: mockFns.notificationsShowMock,
  },
}))

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '../../api/clients/spliceAPI',
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
    useBankLinkControllerInitiateLinking:
      mockFns.useBankLinkControllerInitiateLinkingMock,
  }
})

const account: Account = {
  id: 'account-id',
  userId: 'user-id',
  name: 'Checking',
  customName: null,
  mask: null,
  availableBalance: {
    money: { amount: 10000, currency: 'USD' },
    sign: MoneyWithSignSign.positive,
  },
  currentBalance: {
    money: { amount: 10000, currency: 'USD' },
    sign: MoneyWithSignSign.positive,
  },
  type: AccountType.depository,
  valuationMode: 'balance',
  subType: null,
  externalAccountId: null,
  bankLinkId: null,
  bankLink: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
}

function renderAccountRow() {
  return render(
    <MantineProvider>
      <AccountRow account={account} />
    </MantineProvider>,
  )
}

function renderAccount(overrides: Partial<Account>) {
  return render(
    <MantineProvider>
      <AccountRow account={{ ...account, ...overrides }} />
    </MantineProvider>,
  )
}

beforeEach(() => {
  mockFns.archiveMutateMock.mockImplementation((_variables, options) => {
    options?.onSuccess?.()
  })
  mockFns.useAccountControllerUpdateMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  })
  mockFns.useBankLinkControllerInitiateLinkingMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
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

describe('AccountRow archive action', () => {
  it('confirms archive and invalidates account and balance queries', async () => {
    renderAccountRow()

    fireEvent.click(screen.getByRole('button', { name: /archive account/i }))
    expect(await screen.findByText(/hide this account/i)).toBeTruthy()

    fireEvent.click(
      await screen.findByRole('button', { name: /confirm archive/i }),
    )

    expect(mockFns.archiveMutateMock).toHaveBeenCalledWith(
      { id: 'account-id' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
    expect(mockFns.invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['/account'],
    })
    expect(mockFns.invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['/balance-query/balances'],
    })
    expect(mockFns.invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['/balance-query/all-balances'],
    })
    expect(mockFns.notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Account archived',
      }),
    )
  })
})

describe('AccountRow Plaid conversion', () => {
  it('offers Plaid conversion for ordinary manual accounts', () => {
    renderAccountRow()

    expect(screen.getByRole('button', { name: 'Link with Plaid' })).toBeTruthy()
  })

  it('does not offer Plaid conversion for holdings-valued accounts', () => {
    renderAccount({ valuationMode: 'holdings' } as Partial<Account>)

    expect(screen.queryByRole('button', { name: 'Link with Plaid' })).toBeNull()
  })
})
