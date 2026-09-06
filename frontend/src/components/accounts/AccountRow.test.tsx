import { MantineProvider } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../../api/models'
import { AccountRow } from './AccountRow'
import type { Query, QueryFilters } from '@tanstack/react-query'
import type * as ReactQuery from '@tanstack/react-query'
import type { Account } from '../../api/models'

const mockFns = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(),
  archiveMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
  archivePending: false,
  updatePending: false,
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
      isPending: mockFns.archivePending,
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
    money: { amount: '10000', currency: 'USD' },
    sign: MoneyWithSignSign.positive,
  },
  currentBalance: {
    money: { amount: '10000', currency: 'USD' },
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
  mockFns.archivePending = false
  mockFns.updatePending = false
  mockFns.archiveMutateMock.mockImplementation((_variables, options) => {
    options?.onSuccess?.()
    options?.onSettled?.()
  })
  mockFns.updateMutateMock.mockImplementation((_variables, options) => {
    options?.onSuccess?.()
    options?.onSettled?.()
  })
  mockFns.useAccountControllerUpdateMock.mockImplementation(() => ({
    mutate: mockFns.updateMutateMock,
    isPending: mockFns.updatePending,
  }))
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

    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))

    expect(mockFns.archiveMutateMock).toHaveBeenCalledWith(
      { id: 'account-id' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
    expect(
      mockFns.invalidateQueriesMock.mock.calls.some(
        ([filters]: Array<QueryFilters | undefined>) =>
          filters?.predicate?.({ queryKey: ['/account'] } as unknown as Query),
      ),
    ).toBe(true)
    expect(
      mockFns.invalidateQueriesMock.mock.calls.some(
        ([filters]: Array<QueryFilters | undefined>) =>
          filters?.predicate?.({
            queryKey: ['/balance-query/balances'],
          } as unknown as Query),
      ),
    ).toBe(true)
    expect(
      mockFns.invalidateQueriesMock.mock.calls.some(
        ([filters]: Array<QueryFilters | undefined>) =>
          filters?.predicate?.({
            queryKey: ['/balance-query/all-balances'],
          } as unknown as Query),
      ),
    ).toBe(true)
    expect(mockFns.notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Account archived',
      }),
    )
  })

  it('does not archive until confirmed and keeps a failed confirmation open for retry', async () => {
    mockFns.archiveMutateMock.mockImplementationOnce((_variables, options) => {
      options?.onError?.({
        response: { data: { message: 'Account is still syncing.' } },
      })
      options?.onSettled?.()
    })
    renderAccountRow()
    fireEvent.click(screen.getByRole('button', { name: 'Archive account' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Archive account',
    })
    expect(within(dialog).getByText('Checking')).toBeTruthy()
    expect(mockFns.archiveMutateMock).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Account is still syncing.',
    )
    expect(screen.getByRole('dialog', { name: 'Archive account' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))
    expect(mockFns.archiveMutateMock).toHaveBeenCalledTimes(2)
    expect(mockFns.notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Account archived' }),
    )
  })
})

describe('AccountRow rename feedback', () => {
  it('preserves a failed rename draft and closes only after a successful retry', () => {
    mockFns.updateMutateMock.mockImplementationOnce((_variables, options) => {
      options?.onError?.({
        response: { data: { message: 'Name is already in use.' } },
      })
      options?.onSettled?.()
    })
    renderAccountRow()
    fireEvent.click(screen.getByRole('button', { name: 'Edit account name' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Account name' }), {
      target: { value: 'Household checking' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save account name' }))
    expect(
      screen
        .getByRole('textbox', { name: 'Account name' })
        .getAttribute('value'),
    ).toBe('Household checking')
    expect(screen.getByText('Name is already in use.')).toBeTruthy()
    expect(mockFns.notificationsShowMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save account name' }))
    expect(mockFns.updateMutateMock).toHaveBeenLastCalledWith(
      { id: account.id, data: { name: 'Household checking' } },
      expect.any(Object),
    )
    expect(screen.queryByRole('textbox', { name: 'Account name' })).toBeNull()
    expect(
      mockFns.invalidateQueriesMock.mock.calls.some(
        ([filters]: Array<QueryFilters | undefined>) =>
          filters?.predicate?.({ queryKey: ['/account'] } as unknown as Query),
      ),
    ).toBe(true)
  })

  it('keeps pending input and controls locked and prevents repeated submit or Escape cancellation', () => {
    mockFns.updateMutateMock.mockImplementation(() => undefined)
    const view = renderAccountRow()
    fireEvent.click(screen.getByRole('button', { name: 'Edit account name' }))
    const input = screen.getByRole('textbox', { name: 'Account name' })
    fireEvent.change(input, { target: { value: 'Household checking' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save account name' }))
    const form = input.closest('form')
    if (!form) throw new Error('Rename form is missing')
    fireEvent.submit(form)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(mockFns.updateMutateMock).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox', { name: 'Account name' })).toBeTruthy()

    mockFns.updatePending = true
    view.rerender(
      <MantineProvider>
        <AccountRow account={account} />
      </MantineProvider>,
    )
    expect(
      screen
        .getByRole('textbox', { name: 'Account name' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: 'Save account name' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: 'Cancel account name edit' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('keeps the linked-account custom-name contract and reports reset failures', () => {
    renderAccount({ bankLinkId: 'bank-link', customName: 'Personal checking' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit account name' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Account name' }), {
      target: { value: 'Checking' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save account name' }))
    expect(mockFns.updateMutateMock).toHaveBeenCalledWith(
      { id: account.id, data: { customName: null } },
      expect.any(Object),
    )

    mockFns.updateMutateMock.mockImplementationOnce((_variables, options) => {
      options?.onError?.({
        response: { data: { message: 'Account is unavailable.' } },
      })
      options?.onSettled?.()
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset to synced account name' }),
    )
    expect(mockFns.notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Name not reset',
        message: 'Account is unavailable.',
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
