import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type * as ReactQuery from '@tanstack/react-query'
import type { Account } from '../../api/models'
import {
  getAccountControllerFindAllQueryKey,
  getAccountControllerFindOneQueryKey,
  getBalanceQueryControllerGetAllBalancesQueryKey,
  getBalanceQueryControllerGetBalancesQueryKey,
  getTransactionAnalysisControllerGetAnalysisQueryKey,
  getTransactionAnalysisControllerGetTransactionsQueryKey,
  getTransactionControllerFindAllQueryKey,
} from '../../api/clients/spliceAPI'
import { UpdateBalanceModal } from './UpdateBalanceModal'

type MutationState = {
  mutate: ReturnType<typeof vi.fn>
  isPending: boolean
}

type QueryClientState = {
  invalidateQueries: ReturnType<typeof vi.fn>
}

const mockFns = vi.hoisted(() => ({
  updateBalanceHook: vi.fn(),
  useQueryClientMock: vi.fn(),
  notificationsShowMock: vi.fn(),
}))

let mutationState: MutationState
let queryClientState: QueryClientState

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useAccountControllerUpdateBalance: mockFns.updateBalanceHook,
  }
})

vi.mock('@tanstack/react-query', async () => {
  const actual: typeof ReactQuery = await vi.importActual(
    '@tanstack/react-query',
  )

  return {
    ...actual,
    useQueryClient: mockFns.useQueryClientMock,
  }
})

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: mockFns.notificationsShowMock,
  },
}))

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: overrides.id ?? 'manual-id',
    name: overrides.name ?? 'Manual cash',
    customName: overrides.customName ?? null,
    mask: overrides.mask ?? null,
    type: overrides.type ?? 'depository',
    subType: overrides.subType ?? null,
    externalAccountId: overrides.externalAccountId ?? null,
    bankLinkId: overrides.bankLinkId ?? null,
    bankLink: overrides.bankLink,
    syncedAt: overrides.syncedAt,
    availableBalance: overrides.availableBalance ?? {
      money: { amount: 125000, currency: 'USD' },
      sign: 'positive',
    },
    currentBalance: overrides.currentBalance ?? {
      money: { amount: 125000, currency: 'USD' },
      sign: 'positive',
    },
    latestSnapshotDate: overrides.latestSnapshotDate,
    createdAt: overrides.createdAt ?? '2026-03-20T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-03-20T00:00:00.000Z',
    userId: overrides.userId ?? 'user-1',
    ...overrides,
  }
}

function renderModal(account: Account, onClose = vi.fn()) {
  return {
    onClose,
    ...render(
      <MantineProvider>
        <UpdateBalanceModal opened onClose={onClose} account={account} />
      </MantineProvider>,
    ),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-24T12:00:00.000Z'))

  mutationState = {
    mutate: vi.fn(),
    isPending: false,
  }
  queryClientState = {
    invalidateQueries: vi.fn(),
  }

  mockFns.updateBalanceHook.mockImplementation(() => mutationState)
  mockFns.useQueryClientMock.mockImplementation(() => queryClientState)

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
  vi.useRealTimers()
})

describe('UpdateBalanceModal', () => {
  it('defaults the effective date to today and submits the typed payload for same-day saves', () => {
    const account = makeAccount({ latestSnapshotDate: '2026-03-20' })
    const { onClose } = renderModal(account)

    mutationState.mutate.mockImplementation((_variables, options) => {
      options?.onSuccess?.(account, _variables, undefined)
    })

    const dateInput = screen.getByLabelText(/effective date/i)
    fireEvent.change(dateInput, { target: { value: '2026-03-24' } })
    fireEvent.change(screen.getByLabelText(/current balance/i), {
      target: { value: '1300.00' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect((dateInput as HTMLInputElement).value).toBe('2026-03-24')
    expect(mutationState.mutate).toHaveBeenCalledWith(
      {
        id: 'manual-id',
        data: {
          balance: {
            money: { amount: 130000, currency: 'USD' },
            sign: 'positive',
          },
          effectiveDate: '2026-03-24',
          confirmHistoryReset: false,
        },
      },
      expect.any(Object),
    )
    expect(queryClientState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: getAccountControllerFindAllQueryKey(),
    })
    expect(queryClientState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: getAccountControllerFindOneQueryKey('manual-id'),
    })
    expect(queryClientState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: getBalanceQueryControllerGetBalancesQueryKey(),
    })
    expect(queryClientState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: getBalanceQueryControllerGetAllBalancesQueryKey(),
    })
    expect(queryClientState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: getTransactionControllerFindAllQueryKey(),
    })
    expect(queryClientState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: getTransactionAnalysisControllerGetAnalysisQueryKey(),
    })
    expect(queryClientState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: getTransactionAnalysisControllerGetTransactionsQueryKey(),
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('requires confirmation before submitting a destructive backdated save', () => {
    const account = makeAccount({ latestSnapshotDate: '2026-03-24' })
    renderModal(account)

    fireEvent.change(screen.getByLabelText(/effective date/i), {
      target: { value: '2026-03-20' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(mutationState.mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/remove all later balance history/i)).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: /confirm reset and save/i }),
    )

    expect(mutationState.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          effectiveDate: '2026-03-20',
          confirmHistoryReset: true,
        }),
      }),
      expect.any(Object),
    )
  })
})
