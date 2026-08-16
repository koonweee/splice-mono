import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../../api/models'
import { AddAccountModal } from './AddAccountModal'
import { InlineBalanceEditor } from './InlineBalanceEditor'
import type * as Mantine from '@mantine/core'
import type { Account } from '../../api/models'
import type React from 'react'

const mockFns = vi.hoisted(() => ({
  createMutateMock: vi.fn(),
  createBrokerageMutateMock: vi.fn(),
  useCreateBrokerageMock: vi.fn(),
  updateBalanceMutateMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
}))

vi.mock('../investments/ManualBrokeragePositionsEditor', () => ({
  isPositiveDecimal: (value: string) => Number(value) > 0,
  ManualBrokeragePositionsEditor: ({
    onChange,
  }: {
    onChange: (positions: Array<{ symbol: string; quantity: string }>) => void
  }) => (
    <button
      onClick={() =>
        onChange([
          { symbol: 'GOOGL', quantity: '2' },
          { symbol: 'INTC', quantity: '97' },
          { symbol: 'NVDA', quantity: '7' },
          { symbol: 'TSM', quantity: '8' },
          { symbol: 'C6L.SI', quantity: '200' },
        ])
      }
      type="button"
    >
      Load reference portfolio
    </button>
  ),
}))

vi.mock('@mantine/core', async () => {
  const actual: typeof Mantine = await vi.importActual('@mantine/core')

  type SelectOption = string | { value: string; label: string }

  return {
    ...actual,
    Modal: ({
      children,
      opened,
      title,
    }: {
      children: React.ReactNode
      opened: boolean
      title?: React.ReactNode
    }) =>
      opened ? (
        <div>
          <h2>{title}</h2>
          {children}
        </div>
      ) : null,
    NumberInput: ({
      'aria-label': ariaLabel,
      label,
      onChange,
      value,
    }: {
      'aria-label'?: string
      label?: string
      onChange?: (value: number | string) => void
      value?: number | string
    }) => (
      <label>
        {label}
        <input
          aria-label={ariaLabel ?? label}
          onChange={(event) => onChange?.(Number(event.currentTarget.value))}
          value={value ?? ''}
        />
      </label>
    ),
    Select: ({
      data = [],
      label,
      onChange,
      value,
    }: {
      data?: Array<SelectOption>
      label?: string
      onChange?: (value: string | null) => void
      value?: string | null
    }) => (
      <label>
        {label}
        <select
          aria-label={label}
          onChange={(event) => onChange?.(event.currentTarget.value || null)}
          value={value ?? ''}
        >
          {data.map((option) => {
            const normalized =
              typeof option === 'string'
                ? { value: option, label: option }
                : option
            return (
              <option key={normalized.value} value={normalized.value}>
                {normalized.label}
              </option>
            )
          })}
        </select>
      </label>
    ),
  }
})

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockFns.invalidateQueriesMock,
    }),
  }
})

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}))

vi.mock('../../api/clients/spliceAPI', () => ({
  getAccountControllerFindAllQueryKey: () => ['/account'],
  getBalanceQueryControllerGetAllBalancesQueryKey: () => [
    '/balance-query/all-balances',
  ],
  getBalanceQueryControllerGetBalancesQueryKey: () => [
    '/balance-query/balances',
  ],
  investmentControllerSearchSecurities: vi.fn(),
  useAccountControllerCreate: () => ({
    mutate: mockFns.createMutateMock,
    isPending: false,
  }),
  useInvestmentControllerCreateManualBrokerageAccount: () =>
    mockFns.useCreateBrokerageMock(),
  useAccountControllerUpdateBalance: () => ({
    mutate: mockFns.updateBalanceMutateMock,
    isPending: false,
  }),
  useBankLinkControllerInitiateLinking: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
}))

function buildAccount(
  amount: number,
  currency: string,
  sign: MoneyWithSignSign,
): Account {
  return {
    id: 'account-id',
    userId: 'user-id',
    name: 'Manual account',
    customName: null,
    notes: null,
    mask: null,
    availableBalance: { money: { amount, currency }, sign },
    currentBalance: { money: { amount, currency }, sign },
    type: AccountType.depository,
    valuationMode: 'balance',
    subType: null,
    externalAccountId: null,
    bankLinkId: null,
    bankLink: null,
    archivedAt: null,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFns.useCreateBrokerageMock.mockReturnValue({
    mutate: mockFns.createBrokerageMutateMock,
    isPending: false,
    isError: false,
    error: null,
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
})

describe('manual account money payloads', () => {
  it.each([
    ['USD', -12.34, 1234],
    ['USD', 12.34, 1234],
    ['JPY', -1234, 1234],
    ['JPY', 1234, 1234],
  ])(
    'creates a canonical %s payload for %s',
    (currency, enteredAmount, expectedMagnitude) => {
      render(
        <MantineProvider>
          <AddAccountModal opened onClose={vi.fn()} />
        </MantineProvider>,
      )

      fireEvent.click(screen.getByText('Manual account'))
      fireEvent.change(screen.getByRole('textbox', { name: /Account name/ }), {
        target: { value: 'Cash' },
      })
      fireEvent.change(screen.getByLabelText('Currency'), {
        target: { value: currency },
      })
      fireEvent.change(screen.getByLabelText('Current balance'), {
        target: { value: String(enteredAmount) },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

      const expectedSign =
        enteredAmount < 0
          ? MoneyWithSignSign.negative
          : MoneyWithSignSign.positive
      expect(mockFns.createMutateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            availableBalance: {
              money: { amount: expectedMagnitude, currency },
              sign: expectedSign,
            },
            currentBalance: {
              money: { amount: expectedMagnitude, currency },
              sign: expectedSign,
            },
          }),
        }),
        expect.any(Object),
      )
    },
  )

  it('creates a brokerage through the holdings contract instead of a balance payload', () => {
    mockFns.createBrokerageMutateMock.mockImplementation(
      (_variables, options) => options?.onSuccess?.({ staleSymbols: [] }),
    )
    render(
      <MantineProvider>
        <AddAccountModal opened onClose={vi.fn()} />
      </MantineProvider>,
    )

    fireEvent.click(screen.getByText('Manual account'))
    fireEvent.change(screen.getByRole('textbox', { name: /Account name/ }), {
      target: { value: 'Prime Account UI valuation test' },
    })
    fireEvent.change(screen.getByLabelText('Account type'), {
      target: { value: 'brokerage_holdings' },
    })
    fireEvent.change(screen.getByLabelText('Currency'), {
      target: { value: 'USD' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Load reference portfolio' }),
    )
    expect(screen.queryByLabelText('Current balance')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(mockFns.createBrokerageMutateMock).toHaveBeenCalledWith(
      {
        data: {
          name: 'Prime Account UI valuation test',
          accountCurrency: 'USD',
          positions: [
            { symbol: 'GOOGL', quantity: '2' },
            { symbol: 'INTC', quantity: '97' },
            { symbol: 'NVDA', quantity: '7' },
            { symbol: 'TSM', quantity: '8' },
            { symbol: 'C6L.SI', quantity: '200' },
          ],
        },
      },
      expect.any(Object),
    )
    expect(mockFns.createMutateMock).not.toHaveBeenCalled()
    expect(mockFns.invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['/account'],
    })
    expect(mockFns.invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['/balance-query/balances'],
    })
    expect(mockFns.invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['/balance-query/all-balances'],
    })
  })

  it('keeps balance-only manual investment accounts available', () => {
    render(
      <MantineProvider>
        <AddAccountModal opened onClose={vi.fn()} />
      </MantineProvider>,
    )

    fireEvent.click(screen.getByText('Manual account'))
    fireEvent.change(screen.getByRole('textbox', { name: /Account name/ }), {
      target: { value: 'Private investment' },
    })
    fireEvent.change(screen.getByLabelText('Account type'), {
      target: { value: 'investment' },
    })
    fireEvent.change(screen.getByLabelText('Current balance'), {
      target: { value: '1250' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(mockFns.createMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Private investment',
          type: AccountType.investment,
          currentBalance: {
            money: { amount: 125000, currency: 'USD' },
            sign: MoneyWithSignSign.positive,
          },
        }),
      }),
      expect.any(Object),
    )
    expect(mockFns.createBrokerageMutateMock).not.toHaveBeenCalled()
  })

  it('keeps the brokerage form open with an actionable valuation error', () => {
    mockFns.useCreateBrokerageMock.mockReturnValue({
      mutate: mockFns.createBrokerageMutateMock,
      isPending: false,
      isError: true,
      error: {
        response: { data: { message: 'C6L.SI has no usable quote.' } },
      },
    })
    render(
      <MantineProvider>
        <AddAccountModal opened onClose={vi.fn()} />
      </MantineProvider>,
    )

    fireEvent.click(screen.getByText('Manual account'))
    fireEvent.change(screen.getByLabelText('Account type'), {
      target: { value: 'brokerage_holdings' },
    })

    expect(screen.getByRole('alert').textContent).toContain(
      'C6L.SI has no usable quote.',
    )
    expect(screen.getByText('Add manual account')).toBeTruthy()
  })

  it.each([
    ['USD', -25.5, 1234, 2550, MoneyWithSignSign.negative],
    ['USD', 25.5, 1234, 2550, MoneyWithSignSign.positive],
    ['JPY', -250, 1234, 250, MoneyWithSignSign.negative],
    ['JPY', 250, 1234, 250, MoneyWithSignSign.positive],
  ])(
    'updates %s to %s canonically from a negative initial value',
    (
      currency,
      enteredAmount,
      initialMagnitude,
      expectedMagnitude,
      expectedSign,
    ) => {
      render(
        <MantineProvider>
          <InlineBalanceEditor
            account={buildAccount(
              initialMagnitude,
              currency,
              MoneyWithSignSign.negative,
            )}
            balance={
              buildAccount(
                initialMagnitude,
                currency,
                MoneyWithSignSign.negative,
              ).currentBalance
            }
            onCancel={vi.fn()}
            onSaved={vi.fn()}
          />
        </MantineProvider>,
      )

      const input = screen.getByLabelText('Current balance')
      expect((input as HTMLInputElement).value).toBe(
        String(currency === 'JPY' ? -1234 : -12.34),
      )
      fireEvent.change(input, { target: { value: String(enteredAmount) } })
      fireEvent.click(screen.getByRole('button', { name: 'Save balance' }))

      expect(mockFns.updateBalanceMutateMock).toHaveBeenCalledWith(
        {
          id: 'account-id',
          data: {
            balance: {
              money: { amount: expectedMagnitude, currency },
              sign: expectedSign,
            },
          },
        },
        expect.any(Object),
      )
    },
  )
})
