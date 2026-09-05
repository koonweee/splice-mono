import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../../api/models'
import { ManualTransactionModal } from './ManualTransactionModal'
import type * as Mantine from '@mantine/core'
import type { Account, Category } from '../../api/models'
import type React from 'react'

const mockFns = vi.hoisted(() => ({
  createMutateMock: vi.fn(),
  createRecurringMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
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
      error,
      label,
      onChange,
      rightSection,
      value,
    }: {
      error?: React.ReactNode
      label?: string
      onChange?: (value: number | string) => void
      rightSection?: React.ReactNode
      value?: number | string
    }) => (
      <label>
        {label}
        <input
          aria-label={label}
          onChange={(event) => onChange?.(Number(event.currentTarget.value))}
          value={value ?? ''}
        />
        {rightSection}
        {error && <span>{error}</span>}
      </label>
    ),
    Select: ({
      data = [],
      error,
      label,
      onChange,
      placeholder,
      rightSection,
      value,
    }: {
      data?: Array<SelectOption>
      error?: React.ReactNode
      label?: string
      onChange?: (value: string | null) => void
      placeholder?: string
      rightSection?: React.ReactNode
      value?: string | null
    }) => {
      const options = data.map((option) =>
        typeof option === 'string' ? { value: option, label: option } : option,
      )

      return (
        <label>
          {label ?? placeholder}
          <select
            aria-label={label ?? placeholder}
            onChange={(event) => onChange?.(event.currentTarget.value || null)}
            value={value ?? ''}
          >
            <option value="">{placeholder ?? label}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {rightSection}
          {error && <span>{error}</span>}
        </label>
      )
    },
    TextInput: ({
      error,
      label,
      onChange,
      readOnly,
      type = 'text',
      value,
    }: {
      error?: React.ReactNode
      label?: string
      onChange?: React.ChangeEventHandler<HTMLInputElement>
      readOnly?: boolean
      type?: string
      value?: string
    }) => (
      <label>
        {label}
        <input
          aria-label={label}
          onChange={onChange}
          readOnly={readOnly}
          type={type}
          value={value ?? ''}
        />
        {error && <span>{error}</span>}
      </label>
    ),
    Switch: ({
      checked,
      label,
      onChange,
    }: {
      checked?: boolean
      label?: string
      onChange?: React.ChangeEventHandler<HTMLInputElement>
    }) => (
      <label>
        {label}
        <input
          aria-label={label}
          checked={checked}
          onChange={onChange}
          type="checkbox"
        />
      </label>
    ),
  }
})

vi.mock('../../api/clients/spliceAPI', () => ({
  useRecurringManualTransactionControllerCreate: () => ({
    mutate: mockFns.createRecurringMutateMock,
    isPending: false,
  }),
  useTransactionControllerCreateManual: () => ({
    mutate: mockFns.createMutateMock,
    isPending: false,
  }),
  useTransactionControllerUpdateManual: () => ({
    mutate: mockFns.updateMutateMock,
    isPending: false,
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
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

describe('ManualTransactionModal', () => {
  it('cancels the editor without submitting the transaction', () => {
    const onClose = vi.fn()
    renderModal(onClose)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(mockFns.createMutateMock).not.toHaveBeenCalled()
    expect(mockFns.createRecurringMutateMock).not.toHaveBeenCalled()
    expect(mockFns.updateMutateMock).not.toHaveBeenCalled()
  })

  it('creates a signed manual transaction in the selected account currency', () => {
    renderModal()

    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '-12.34' },
    })
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-05-07' },
    })
    fireEvent.change(screen.getByLabelText('Merchant'), {
      target: { value: 'Coffee Shop' },
    })
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'category-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockFns.createMutateMock).toHaveBeenCalledWith(
      {
        data: {
          accountId: 'account-1',
          amount: {
            money: { amount: 1234, currency: 'USD' },
            sign: MoneyWithSignSign.negative,
          },
          merchantName: 'Coffee Shop',
          providerDate: '2026-05-07',
          categoryId: 'category-1',
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })

  it('creates a recurring manual transaction schedule when recurrence is enabled', () => {
    renderModal()

    expect(screen.queryByLabelText('Day of month')).toBeNull()

    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '-12.34' },
    })
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-05-07' },
    })
    fireEvent.click(screen.getByLabelText('Repeat monthly'))
    fireEvent.change(screen.getByLabelText('Merchant'), {
      target: { value: 'Coffee Shop' },
    })
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'category-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockFns.createRecurringMutateMock).toHaveBeenCalledWith(
      {
        data: {
          accountId: 'account-1',
          amount: {
            money: { amount: 1234, currency: 'USD' },
            sign: MoneyWithSignSign.negative,
          },
          merchantName: 'Coffee Shop',
          categoryId: 'category-1',
          frequency: 'monthly',
          dayOfMonth: 7,
          startDate: '2026-05-07',
          endDate: null,
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
    expect(mockFns.createMutateMock).not.toHaveBeenCalled()
  })

  it('updates currency and precision when the account changes', () => {
    renderModal()

    fireEvent.change(screen.getByLabelText('Account'), {
      target: { value: 'account-jpy' },
    })
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '500' },
    })
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-05-07' },
    })
    fireEvent.change(screen.getByLabelText('Merchant'), {
      target: { value: 'Transit' },
    })
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'category-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByLabelText<HTMLInputElement>('Currency').value).toBe(
      'JPY',
    )
    expect(mockFns.createMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'account-jpy',
          amount: {
            money: { amount: 500, currency: 'JPY' },
            sign: MoneyWithSignSign.positive,
          },
        }),
      }),
      expect.any(Object),
    )
  })

  it('can make a typed amount negative without entering a minus character', () => {
    renderModal()

    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '12.34' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Make amount negative' }),
    )
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-05-07' },
    })
    fireEvent.change(screen.getByLabelText('Merchant'), {
      target: { value: 'Coffee Shop' },
    })
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'category-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockFns.createMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: {
            money: { amount: 1234, currency: 'USD' },
            sign: MoneyWithSignSign.negative,
          },
        }),
      }),
      expect.any(Object),
    )
  })

  it('blocks zero amount and missing category before submit', () => {
    renderModal()

    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-05-07' },
    })
    fireEvent.change(screen.getByLabelText('Merchant'), {
      target: { value: 'Coffee Shop' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Enter a non-zero amount')).toBeTruthy()
    expect(screen.getByText('Category is required')).toBeTruthy()
    expect(mockFns.createMutateMock).not.toHaveBeenCalled()
  })

  it('allows clearing the account and errors on save', () => {
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Clear account' }))
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '12.34' },
    })
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-05-07' },
    })
    fireEvent.change(screen.getByLabelText('Merchant'), {
      target: { value: 'Coffee Shop' },
    })
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'category-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Account is required')).toBeTruthy()
    expect(mockFns.createMutateMock).not.toHaveBeenCalled()
  })
})

function renderModal(onClose = vi.fn()) {
  return render(
    <MantineProvider>
      <ManualTransactionModal
        opened
        accounts={[
          makeAccount('account-1', 'Checking', 'USD'),
          makeAccount('account-jpy', 'Travel', 'JPY'),
        ]}
        categories={[category]}
        defaultAccountId="account-1"
        onClose={onClose}
      />
    </MantineProvider>,
  )
}

function makeAccount(id: string, name: string, currency: string): Account {
  return {
    id,
    userId: 'user-1',
    name,
    customName: null,
    mask: null,
    availableBalance: {
      money: { amount: 10000, currency },
      sign: MoneyWithSignSign.positive,
    },
    currentBalance: {
      money: { amount: 10000, currency },
      sign: MoneyWithSignSign.positive,
    },
    type: AccountType.depository,
    valuationMode: 'balance',
    subType: null,
    externalAccountId: null,
    bankLinkId: null,
    bankLink: null,
    archivedAt: null,
    createdAt: '2026-02-14T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
  }
}

const category: Category = {
  id: 'category-1',
  primary: 'Food',
  detailed: 'Restaurants',
  description: 'Food category',
  color: '#228be6',
  archivedAt: null,
  createdAt: '2026-02-14T00:00:00.000Z',
  updatedAt: '2026-02-14T00:00:00.000Z',
}
