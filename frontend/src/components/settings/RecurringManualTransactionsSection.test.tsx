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
import { MoneyWithSignSign } from '../../api/models'
import { RecurringManualTransactionsSection } from './RecurringManualTransactionsSection'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type { RecurringManualTransactionSchedule } from '../../api/models'

const mockFns = vi.hoisted(() => ({
  archiveMutateMock: vi.fn(),
  createMutateMock: vi.fn(),
  pauseMutateMock: vi.fn(),
  resumeMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
}))

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useAccountControllerFindAll: () => ({ data: [] }),
    useCategoryControllerFindAll: () => ({ data: [] }),
    useRecurringManualTransactionControllerArchive: () => ({
      mutate: mockFns.archiveMutateMock,
      isPending: false,
    }),
    useRecurringManualTransactionControllerCreate: () => ({
      mutate: mockFns.createMutateMock,
      isPending: false,
    }),
    useRecurringManualTransactionControllerFindAll: () => ({
      data: scheduleItems,
      isError: false,
    }),
    useRecurringManualTransactionControllerPause: () => ({
      mutate: mockFns.pauseMutateMock,
      isPending: false,
    }),
    useRecurringManualTransactionControllerResume: () => ({
      mutate: mockFns.resumeMutateMock,
      isPending: false,
    }),
    useRecurringManualTransactionControllerUpdate: () => ({
      mutate: mockFns.updateMutateMock,
      isPending: false,
    }),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  scheduleItems = schedules
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
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('RecurringManualTransactionsSection', () => {
  it('shows schedules and supports pause and delete actions', () => {
    renderSection()

    expect(screen.getByText('Rent')).toBeTruthy()
    expect(screen.getByText('Monthly on 31st')).toBeTruthy()
    expect(screen.getByText('Jun 30, 2026')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Pause recurring transaction' }),
    )
    expect(mockFns.pauseMutateMock).toHaveBeenCalledWith({
      id: schedules[0].id,
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete recurring transaction' }),
    )
    expect(mockFns.archiveMutateMock).toHaveBeenCalledWith({
      id: schedules[0].id,
    })
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
    expect(mockFns.resumeMutateMock).toHaveBeenCalledWith({
      id: schedules[0].id,
    })

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
      money: { amount: 125000, currency: 'USD' },
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
