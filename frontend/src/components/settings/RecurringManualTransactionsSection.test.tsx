import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../../api/models'
import { RecurringManualTransactionsSection } from './RecurringManualTransactionsSection'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type {
  Account,
  Category,
  RecurringManualTransactionSchedule,
} from '../../api/models'

const mockFns = vi.hoisted(() => ({
  refetchMock: vi.fn(),
  queryError: false,
  archiveMutateMock: vi.fn(),
  createMutateMock: vi.fn(),
  pauseMutateMock: vi.fn(),
  resumeMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
  notificationsShowMock: vi.fn(),
  pausePending: false,
  archivePending: false,
  updatePending: false,
}))

vi.mock('@mantine/notifications', () => ({
  notifications: { show: mockFns.notificationsShowMock },
}))

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useAccountControllerFindAll: () => ({ data: accountItems }),
    useCategoryControllerFindAll: () => ({ data: categoryItems }),
    useRecurringManualTransactionControllerArchive: () => ({
      mutate: mockFns.archiveMutateMock,
      isPending: mockFns.archivePending,
    }),
    useRecurringManualTransactionControllerCreate: () => ({
      mutate: mockFns.createMutateMock,
      isPending: false,
    }),
    useRecurringManualTransactionControllerFindAll: () => ({
      data: scheduleItems,
      isError: mockFns.queryError,
      refetch: mockFns.refetchMock,
    }),
    useRecurringManualTransactionControllerPause: () => ({
      mutate: mockFns.pauseMutateMock,
      isPending: mockFns.pausePending,
      variables: mockFns.pausePending ? { id: 'schedule-1' } : undefined,
    }),
    useRecurringManualTransactionControllerResume: () => ({
      mutate: mockFns.resumeMutateMock,
      isPending: false,
    }),
    useRecurringManualTransactionControllerUpdate: () => ({
      mutate: mockFns.updateMutateMock,
      isPending: mockFns.updatePending,
    }),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  mockFns.queryError = false
  mockFns.refetchMock.mockReset()
  scheduleItems = schedules
  accountItems = []
  categoryItems = []
  mockFns.pausePending = false
  mockFns.archivePending = false
  mockFns.updatePending = false
  for (const mutate of [
    mockFns.pauseMutateMock,
    mockFns.resumeMutateMock,
    mockFns.archiveMutateMock,
    mockFns.createMutateMock,
    mockFns.updateMutateMock,
  ]) {
    mutate.mockImplementation((_variables, options) => {
      options?.onSuccess?.()
      options?.onSettled?.()
    })
  }
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

describe('RecurringManualTransactionsSection', () => {
  it('keeps cached schedules visible after a refresh failure and wires Retry', () => {
    mockFns.queryError = true
    renderSection()
    expect(
      screen.getAllByText(schedules[0].merchantName).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText('Previously loaded results are shown below.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mockFns.refetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows schedules and supports pause and delete actions', async () => {
    renderSection()

    expect(screen.getByText('Rent')).toBeTruthy()
    expect(screen.getByText('Monthly on 31st')).toBeTruthy()
    expect(screen.getByText('Jun 30, 2026')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Pause recurring transaction' }),
    )
    expect(mockFns.pauseMutateMock).toHaveBeenCalledWith(
      { id: schedules[0].id },
      expect.any(Object),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete recurring transaction' }),
    )
    expect(mockFns.archiveMutateMock).not.toHaveBeenCalled()
    const confirmation = await screen.findByRole('dialog', {
      name: 'Delete recurring transaction',
    })
    expect(within(confirmation).getByText('Rent')).toBeTruthy()
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'Delete' }),
    )
    expect(mockFns.archiveMutateMock).toHaveBeenCalledWith(
      { id: schedules[0].id },
      expect.any(Object),
    )
  })

  it('keeps the next date and resume action accessible in the tablet list', async () => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 48em)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      configurable: true,
    })
    scheduleItems = [{ ...schedules[0], pausedAt: '2026-06-01T00:00:00.000Z' }]
    renderSection()

    const list = screen.getByLabelText('Recurring transactions list, 1 total')
    expect(screen.queryByRole('table')).toBeNull()
    expect(within(list).getByText('Jun 30, 2026')).toBeTruthy()
    expect(within(list).getByText('Paused')).toBeTruthy()
    fireEvent.click(
      within(list).getByRole('button', {
        name: 'Resume recurring transaction',
      }),
    )
    expect(mockFns.resumeMutateMock).toHaveBeenCalledWith(
      { id: schedules[0].id },
      expect.any(Object),
    )

    fireEvent.click(
      within(list).getByRole('button', { name: 'Edit recurring transaction' }),
    )
    const editor = await screen.findByRole('dialog', {
      name: 'Edit recurring transaction',
    })
    expect(within(editor).getByDisplayValue('Rent')).toBeTruthy()
    fireEvent.click(within(editor).getByRole('button', { name: 'Cancel' }))
    expect(mockFns.updateMutateMock).not.toHaveBeenCalled()
  })

  it('validates an incomplete schedule without creating a transaction', async () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Add recurring' }))
    const editor = await screen.findByRole('dialog', {
      name: 'Add recurring transaction',
    })
    const form = within(editor)
      .getByRole('button', { name: 'Save' })
      .closest('form')
    if (!form) throw new Error('Schedule editor form is missing')
    fireEvent.submit(form)
    expect(within(editor).getByText('Account is required')).toBeTruthy()
    expect(mockFns.createMutateMock).not.toHaveBeenCalled()
    fireEvent.click(within(editor).getByRole('button', { name: 'Cancel' }))
  })

  it('reports failed row actions and allows retry', () => {
    mockFns.pauseMutateMock.mockImplementationOnce((_variables, options) => {
      options?.onError?.({
        response: { data: { message: 'Schedule changed. Refresh and retry.' } },
      })
      options?.onSettled?.()
    })
    renderSection()
    const pause = screen.getByRole('button', {
      name: 'Pause recurring transaction',
    })
    fireEvent.click(pause)
    expect(mockFns.notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Pause failed',
        message: 'Schedule changed. Refresh and retry.',
      }),
    )
    fireEvent.click(pause)
    expect(mockFns.pauseMutateMock).toHaveBeenCalledTimes(2)
    expect(mockFns.notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Schedule paused' }),
    )
  })

  it('disables conflicting row actions while pausing and guards repeated submission', () => {
    mockFns.pausePending = true
    renderSection()
    for (const name of [
      'Pause recurring transaction',
      'Edit recurring transaction',
      'Delete recurring transaction',
    ]) {
      const button = screen.getByRole('button', { name })
      expect(button.hasAttribute('disabled')).toBe(true)
      fireEvent.click(button)
    }
    expect(mockFns.pauseMutateMock).not.toHaveBeenCalled()
    expect(mockFns.archiveMutateMock).not.toHaveBeenCalled()
  })

  it('cancels deletion without a request and retains failed deletion for retry', async () => {
    renderSection()
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete recurring transaction' }),
    )
    let dialog = await screen.findByRole('dialog', {
      name: 'Delete recurring transaction',
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(mockFns.archiveMutateMock).not.toHaveBeenCalled()
    mockFns.archiveMutateMock.mockImplementationOnce((_variables, options) => {
      options?.onError?.({
        response: { data: { message: 'Unable to reach the server.' } },
      })
      options?.onSettled?.()
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete recurring transaction' }),
    )
    dialog = await screen.findByRole('dialog', {
      name: 'Delete recurring transaction',
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Unable to reach the server.',
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(mockFns.archiveMutateMock).toHaveBeenCalledTimes(2)
  })

  it('retains a failed editor draft with an inline server error and saves it on retry', async () => {
    accountItems = [activeAccount]
    categoryItems = [rentCategory]
    mockFns.updateMutateMock.mockImplementationOnce((_variables, options) => {
      options?.onError?.({
        response: {
          data: { message: 'The selected category is unavailable.' },
        },
      })
      options?.onSettled?.()
    })
    renderSection()
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit recurring transaction' }),
    )
    const editor = await screen.findByRole('dialog', {
      name: 'Edit recurring transaction',
    })
    fireEvent.change(
      within(editor).getByRole('textbox', { name: /Merchant/ }),
      { target: { value: 'New rent' } },
    )
    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }))
    expect(within(editor).getByRole('alert').textContent).toContain(
      'The selected category is unavailable.',
    )
    expect(within(editor).getByDisplayValue('New rent')).toBeTruthy()
    expect(mockFns.notificationsShowMock).not.toHaveBeenCalled()
    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }))
    expect(mockFns.updateMutateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'schedule-1',
        data: expect.objectContaining({
          merchantName: 'New rent',
          startDate: '2026-05-31',
          amount: schedules[0].amount,
        }),
      }),
      expect.any(Object),
    )
    expect(mockFns.notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Schedule updated' }),
    )
  })
})

function renderSection() {
  const queryClient = new QueryClient()

  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <RecurringManualTransactionsSection />
      </QueryClientProvider>
    </MantineProvider>,
  )
}

const schedules: Array<RecurringManualTransactionSchedule> = [
  {
    id: 'schedule-1',
    userId: 'user-1',
    accountId: 'account-1',
    accountName: 'Checking',
    amount: {
      money: { amount: '125000', currency: 'USD' },
      sign: MoneyWithSignSign.negative,
    },
    merchantName: 'Rent',
    categoryId: 'category-1',
    category: null,
    frequency: 'monthly',
    dayOfMonth: 31,
    startDate: '2026-05-31',
    endDate: null,
    nextOccurrenceDate: '2026-06-30',
    lastGeneratedOccurrenceDate: '2026-05-31',
    pausedAt: null,
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
]

let scheduleItems = schedules

const activeAccount: Account = {
  id: 'account-1',
  userId: 'user-1',
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
const rentCategory: Category = {
  id: 'category-1',
  primary: 'Housing',
  detailed: 'Rent',
  description: 'Monthly rent',
  color: '#123456',
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
}
let accountItems: Array<Account> = []
let categoryItems: Array<Category> = []
