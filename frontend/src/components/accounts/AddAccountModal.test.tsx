import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddAccountModal } from './AddAccountModal'
import type * as Mantine from '@mantine/core'
import type * as SpliceAPI from '../../api/clients/spliceAPI'

const mockFns = vi.hoisted(() => ({
  createMutate: vi.fn(),
  initiateMutate: vi.fn(),
}))

vi.mock('@mantine/core', async () => {
  const actual: typeof Mantine = await vi.importActual('@mantine/core')

  return {
    ...actual,
    Select: ({ label, data, value, onChange }: any) => (
      <label>
        {label}
        <select
          aria-label={label}
          value={value ?? ''}
          onChange={(event) => onChange?.(event.currentTarget.value)}
        >
          {data.map((option: any) => {
            const normalizedOption =
              typeof option === 'string'
                ? { value: option, label: option }
                : option

            return (
              <option
                key={normalizedOption.value}
                value={normalizedOption.value}
              >
                {normalizedOption.label}
              </option>
            )
          })}
        </select>
      </label>
    ),
    NumberInput: ({ label, value, onChange }: any) => (
      <label>
        {label}
        <input
          aria-label={label}
          value={value}
          onChange={(event) => onChange?.(Number(event.currentTarget.value))}
        />
      </label>
    ),
  }
})

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useAccountControllerCreate: () => ({
      mutate: mockFns.createMutate,
      isPending: false,
    }),
    useBankLinkControllerInitiateLinking: () => ({
      mutate: mockFns.initiateMutate,
      isPending: false,
    }),
  }
})

function renderModal() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <AddAccountModal opened onClose={() => {}} />
      </MantineProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockFns.createMutate.mockReset()
  mockFns.initiateMutate.mockReset()
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

describe('AddAccountModal', () => {
  it('shows the valuation mode selector for manual investment accounts and submits holdings mode with zero balances', () => {
    renderModal()

    fireEvent.click(screen.getByText('Manual Account'))
    fireEvent.change(screen.getByPlaceholderText('e.g. Emergency Fund'), {
      target: { value: 'My Brokerage' },
    })
    fireEvent.change(screen.getByLabelText('Account Type'), {
      target: { value: 'investment' },
    })
    fireEvent.change(screen.getByLabelText('Valuation Mode'), {
      target: { value: 'holdings' },
    })

    expect(screen.getByText(/Add dated holdings snapshots/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(mockFns.createMutate).toHaveBeenCalledWith(
      {
        data: expect.objectContaining({
          name: 'My Brokerage',
          manualValuationMode: 'holdings',
          currentBalance: {
            money: { amount: 0, currency: 'USD' },
            sign: 'positive',
          },
          availableBalance: {
            money: { amount: 0, currency: 'USD' },
            sign: 'positive',
          },
        }),
      },
      expect.any(Object),
    )
  })
})
