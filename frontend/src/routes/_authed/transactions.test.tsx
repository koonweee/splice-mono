import { MantineProvider } from '@mantine/core'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AccountType,
  MoneyWithSignSign,
  TransactionSource,
} from '../../api/models'
import { Route } from './transactions'
import type { ComponentType, ReactNode } from 'react'
import type * as Mantine from '@mantine/core'
import type * as ReactQuery from '@tanstack/react-query'
import type * as ReactRouter from '@tanstack/react-router'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type {
  Account,
  BulkTransactionCategoryUpdateResponse,
  Category,
  PaginatedTransactionResponse,
  Transaction,
} from '../../api/models'

type InfiniteQueryOptions = {
  queryFn: (context: { pageParam?: number }) => unknown
}

type BulkUpdateMutateOptions = {
  onSuccess?: (result: BulkTransactionCategoryUpdateResponse) => void
  onError?: () => void
}

type UndoBulkUpdateMutateOptions = {
  onSuccess?: () => void
  onError?: () => void
}

type TransactionBulkEditToolbarMockProps = {
  categoryOptions: Array<{
    value: string
    primary: string
    secondary: string
  }>
  isSaving: boolean
  loadedCount: number
  selectedCount: number
  selectLoadedChecked: boolean
  selectLoadedIndeterminate: boolean
  value: string | null
  onChange: (value: string | null) => void
  onSave: () => void
  onToggleLoaded: () => void
  showSelectLoaded?: boolean
}

type ManualTransactionModalMockProps = {
  accounts: Array<Account>
  categories: Array<Category>
  defaultAccountId: string | null
  opened: boolean
  transaction?: Transaction | null
  onClose: () => void
  onSaved?: () => void
}

const mockFns = vi.hoisted(() => ({
  useSearchMock: vi.fn(),
  useInfiniteQueryMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  useAccountControllerFindAllMock: vi.fn(),
  useCategoryControllerFindAllMock: vi.fn(),
  useCategoryControllerFindFilterOptionsMock: vi.fn(),
  useTransactionControllerBulkUpdateCategoriesMock: vi.fn(),
  useTransactionControllerUndoBulkUpdateCategoriesMock: vi.fn(),
  bulkUpdateMutateMock: vi.fn(),
  undoBulkUpdateMutateMock: vi.fn(),
  transactionControllerFindAllMock: vi.fn(),
  transactionsTableMock: vi.fn(),
  transactionBulkEditToolbarMock: vi.fn(),
  transactionsMobileListMock: vi.fn(),
  manualTransactionModalMock: vi.fn(),
  removeManualMutateMock: vi.fn(),
  refetchMock: vi.fn(),
  notificationsShowMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', async () => {
  const actual: typeof ReactRouter = await vi.importActual(
    '@tanstack/react-router',
  )

  return {
    ...actual,
    createFileRoute: () => (config: Record<string, unknown>) => ({
      ...config,
      useSearch: mockFns.useSearchMock,
    }),
  }
})

vi.mock('@tanstack/react-query', async () => {
  const actual: typeof ReactQuery = await vi.importActual(
    '@tanstack/react-query',
  )

  return {
    ...actual,
    useInfiniteQuery: mockFns.useInfiniteQueryMock,
    useQueryClient: () => ({
      invalidateQueries: mockFns.invalidateQueriesMock,
    }),
  }
})

vi.mock('@mantine/core', async () => {
  const actual: typeof Mantine = await vi.importActual('@mantine/core')

  type SelectOption = string | { value: string; label: string }
  type SelectMockProps = {
    data?: Array<SelectOption>
    onChange?: (value: string | null) => void
    placeholder?: string
    rightSection?: ReactNode
    value?: string | null
  }
  type SegmentedControlOption = string | { value: string; label: ReactNode }
  type SegmentedControlMockProps = {
    data: Array<SegmentedControlOption>
    onChange: (value: string) => void
    value: string
  }

  return {
    ...actual,
    Select: ({
      data = [],
      onChange,
      placeholder = 'Select',
      rightSection,
      value,
    }: SelectMockProps) => {
      const options = data.map((option) =>
        typeof option === 'string' ? { value: option, label: option } : option,
      )

      return (
        <>
          <select
            aria-label={placeholder}
            onChange={(event) => onChange?.(event.currentTarget.value || null)}
            value={value ?? ''}
          >
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {rightSection}
        </>
      )
    },
    SegmentedControl: ({
      data,
      onChange,
      value,
    }: SegmentedControlMockProps) => (
      <div>
        {data.map((option) => {
          const normalized =
            typeof option === 'string'
              ? { value: option, label: option }
              : option

          return (
            <button
              aria-pressed={normalized.value === value}
              key={normalized.value}
              onClick={() => onChange(normalized.value)}
              type="button"
            >
              {normalized.label}
            </button>
          )
        })}
      </div>
    ),
  }
})

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: mockFns.notificationsShowMock,
  },
}))

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../../api/clients/spliceAPI',
  )

  return {
    ...actual,
    getTransactionControllerFindAllQueryKey: (params: unknown) => [
      '/transaction',
      params,
    ],
    transactionControllerFindAll: mockFns.transactionControllerFindAllMock,
    useAccountControllerFindAll: mockFns.useAccountControllerFindAllMock,
    useCategoryControllerFindAll: mockFns.useCategoryControllerFindAllMock,
    useCategoryControllerFindFilterOptions:
      mockFns.useCategoryControllerFindFilterOptionsMock,
    useTransactionControllerBulkUpdateCategories:
      mockFns.useTransactionControllerBulkUpdateCategoriesMock,
    useTransactionControllerRemoveManual: () => ({
      mutate: mockFns.removeManualMutateMock,
      isPending: false,
    }),
    useTransactionControllerUndoBulkUpdateCategories:
      mockFns.useTransactionControllerUndoBulkUpdateCategoriesMock,
  }
})

vi.mock('@/components/TransactionsTable', () => ({
  TransactionsTable: (props: unknown) => {
    mockFns.transactionsTableMock(props)

    return <div data-testid="transactions-table" />
  },
}))

vi.mock('@/components/transactions/TransactionBulkEditToolbar', () => ({
  TransactionBulkEditToolbar: (props: TransactionBulkEditToolbarMockProps) => {
    mockFns.transactionBulkEditToolbarMock(props)

    return (
      <div data-testid="transaction-bulk-edit-toolbar">
        <span>{props.selectedCount} selected</span>
        <select
          aria-label="Category"
          onChange={(event) =>
            props.onChange(event.currentTarget.value || null)
          }
          value={props.value ?? ''}
        >
          <option value="">Category</option>
          {props.categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.secondary} - {option.primary}
            </option>
          ))}
        </select>
        <button
          disabled={props.selectedCount === 0 || props.value === null}
          onClick={props.onSave}
          type="button"
        >
          Save
        </button>
      </div>
    )
  },
}))

vi.mock('@/components/transactions/TransactionsMobileList', () => ({
  TransactionsMobileList: (props: unknown) => {
    mockFns.transactionsMobileListMock(props)

    return <div data-testid="transactions-mobile-list" />
  },
}))

vi.mock('@/components/transactions/ManualTransactionModal', () => ({
  ManualTransactionModal: (props: ManualTransactionModalMockProps) => {
    mockFns.manualTransactionModalMock(props)

    if (!props.opened) {
      return null
    }

    return (
      <div data-testid="manual-transaction-modal">
        <span>
          {props.transaction ? 'Edit transaction' : 'Add transaction'}
        </span>
        <span>Default account {props.defaultAccountId}</span>
        <button onClick={props.onSaved} type="button">
          Mock save
        </button>
      </div>
    )
  },
}))

let latestInfiniteQueryOptions: InfiniteQueryOptions
const transactionsPage = (Route as unknown as { component: ComponentType })
  .component

const account: Account = {
  id: 'account-1',
  userId: 'user-1',
  name: 'Checking',
  customName: 'Everyday Checking',
  mask: '1234',
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
  createdAt: '2026-02-14T00:00:00.000Z',
  updatedAt: '2026-02-14T00:00:00.000Z',
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

const transaction = makeTransaction('11111111-1111-4111-8111-111111111111')
const transactionsPageData: PaginatedTransactionResponse = {
  data: [transaction],
  total: 125,
  pageIndex: 0,
  pageSize: 50,
}

function renderTransactionsPage() {
  const TransactionsPage = transactionsPage

  return render(
    <MantineProvider>
      <TransactionsPage />
    </MantineProvider>,
  )
}

function setMobileViewport() {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: query === '(max-width: 48em)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  mockFns.useSearchMock.mockReturnValue({
    accountId: 'account-1',
    startDate: '2026-02-01',
    endDate: '2026-02-28',
  })
  mockFns.useInfiniteQueryMock.mockImplementation(
    (options: InfiniteQueryOptions) => {
      latestInfiniteQueryOptions = options

      return {
        data: {
          pages: [transactionsPageData],
        },
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isError: false,
        isFetching: false,
        isFetchingNextPage: false,
        isLoading: false,
        refetch: mockFns.refetchMock,
      }
    },
  )
  mockFns.transactionControllerFindAllMock.mockResolvedValue(
    transactionsPageData,
  )
  mockFns.useAccountControllerFindAllMock.mockReturnValue({
    data: [account],
  })
  mockFns.useCategoryControllerFindAllMock.mockReturnValue({
    data: [category],
  })
  mockFns.useCategoryControllerFindFilterOptionsMock.mockReturnValue({
    data: [category],
  })
  mockFns.useTransactionControllerBulkUpdateCategoriesMock.mockReturnValue({
    mutate: mockFns.bulkUpdateMutateMock,
    isPending: false,
  })
  mockFns.useTransactionControllerUndoBulkUpdateCategoriesMock.mockReturnValue({
    mutate: mockFns.undoBulkUpdateMutateMock,
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
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('TransactionsPage category assignment workflow', () => {
  it('shows transaction filters without category review controls', () => {
    renderTransactionsPage()

    fireEvent.click(
      screen.getByRole('button', { name: /Open transaction filters/ }),
    )

    expect(
      screen.getByRole('option', { name: 'Restaurants - Food' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear account' })).toBeTruthy()
    expect(
      screen.getByRole('option', {
        name: 'No assigned category - Uncategorized',
      }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Needs review' })).toBeNull()
    expect(screen.queryByText(/Mark .* as reviewed/)).toBeNull()
  })

  it('sends category filters without removed query params', async () => {
    renderTransactionsPage()

    fireEvent.click(
      screen.getByRole('button', { name: /Open transaction filters/ }),
    )
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: category.id },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Outflows' }))

    await latestInfiniteQueryOptions.queryFn({ pageParam: 2 })

    expect(mockFns.transactionControllerFindAllMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-1',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        categoryId: category.id,
        amountSign: 'negative',
        pageIndex: '2',
        pageSize: '50',
      }),
      undefined,
    )
    const lastParams =
      mockFns.transactionControllerFindAllMock.mock.calls.at(-1)?.[0] ?? {}
    expect(Object.keys(lastParams)).not.toContain(
      ['category', 'Review', 'Status'].join(''),
    )
  })

  it('initializes the category filter from the URL search params', async () => {
    mockFns.useSearchMock.mockReturnValue({
      categoryId: 'UNCATEGORIZED',
    })

    renderTransactionsPage()

    await latestInfiniteQueryOptions.queryFn({ pageParam: 0 })

    expect(mockFns.transactionControllerFindAllMock).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 'UNCATEGORIZED',
        pageIndex: '0',
        pageSize: '50',
      }),
      undefined,
    )
  })

  it('opens the add transaction modal with the filtered account selected', async () => {
    renderTransactionsPage()

    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }))

    const modal = await screen.findByTestId('manual-transaction-modal')
    expect(modal).toBeTruthy()
    expect(modal.textContent).toContain('Add transaction')
    expect(modal.textContent).toContain('Default account account-1')
    expect(mockFns.manualTransactionModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accounts: [account],
        defaultAccountId: 'account-1',
        transaction: null,
      }),
    )
  })

  it('opens manual edits and requires explicit deletion confirmation', async () => {
    const manualTransaction = {
      ...transaction,
      source: TransactionSource.manual,
    }

    renderTransactionsPage()

    const tableProps = mockFns.transactionsTableMock.mock.calls.at(-1)?.[0] as {
      onDeleteManualTransaction: (transaction: Transaction) => void
      onEditManualTransaction: (transaction: Transaction) => void
    }

    act(() => {
      tableProps.onEditManualTransaction(manualTransaction)
    })

    expect(mockFns.manualTransactionModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        opened: true,
        transaction: manualTransaction,
      }),
    )

    act(() => {
      tableProps.onDeleteManualTransaction(manualTransaction)
    })

    expect(
      await screen.findByRole('dialog', { name: 'Delete transaction' }),
    ).toBeTruthy()
    expect(mockFns.removeManualMutateMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(mockFns.removeManualMutateMock).toHaveBeenCalledWith(
      { id: manualTransaction.id },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )
  })

  it('cancels deletion safely, keeps failures visible, and closes only after success', async () => {
    renderTransactionsPage()
    const manualTransaction = {
      ...transaction,
      source: TransactionSource.manual,
    }
    const tableProps = mockFns.transactionsTableMock.mock.calls.at(-1)?.[0] as {
      onDeleteManualTransaction: (transaction: Transaction) => void
    }
    act(() => tableProps.onDeleteManualTransaction(manualTransaction))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(mockFns.removeManualMutateMock).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete transaction' }),
      ).toBeNull(),
    )

    act(() => tableProps.onDeleteManualTransaction(manualTransaction))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    const callbacks = mockFns.removeManualMutateMock.mock.calls.at(-1)?.[1] as {
      onSuccess: () => void
      onError: (error: unknown) => void
    }
    act(() =>
      callbacks.onError({
        response: { data: { message: 'Please retry shortly.' } },
      }),
    )
    expect(
      screen.getByRole('dialog', { name: 'Delete transaction' }),
    ).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      'Please retry shortly.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(mockFns.removeManualMutateMock).toHaveBeenCalledTimes(2)
    act(() => callbacks.onSuccess())
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete transaction' }),
      ).toBeNull(),
    )
    expect(mockFns.invalidateQueriesMock).toHaveBeenCalled()
  })

  it('keeps the desktop header and cached table on refresh failure with a visible Retry action', () => {
    mockFns.useInfiniteQueryMock.mockReturnValue({
      data: { pages: [transactionsPageData] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: true,
      isFetching: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: mockFns.refetchMock,
    })
    renderTransactionsPage()

    expect(screen.getByRole('heading', { name: 'Transactions' })).toBeTruthy()
    expect(screen.getByTestId('transactions-table')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      'Error loading transactions',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mockFns.refetchMock).toHaveBeenCalledOnce()
  })

  it('bulk clears selected transaction categories and exposes undo', () => {
    const manualTransaction = {
      ...transaction,
      id: '22222222-2222-4222-8222-222222222222',
      source: TransactionSource.manual,
    }
    mockFns.useInfiniteQueryMock.mockImplementation(
      (options: InfiniteQueryOptions) => {
        latestInfiniteQueryOptions = options

        return {
          data: {
            pages: [
              {
                ...transactionsPageData,
                data: [transaction, manualTransaction],
                total: 2,
              },
            ],
          },
          fetchNextPage: vi.fn(),
          hasNextPage: false,
          isError: false,
          isFetching: false,
          isFetchingNextPage: false,
          isLoading: false,
        }
      },
    )

    renderTransactionsPage()

    fireEvent.click(screen.getByLabelText('Bulk edit'))

    const tableProps = mockFns.transactionsTableMock.mock.calls.at(-1)?.[0] as {
      onToggleTransactionSelection: (transactionId: string) => void
    }

    act(() => {
      tableProps.onToggleTransactionSelection(transaction.id)
      tableProps.onToggleTransactionSelection(manualTransaction.id)
    })

    expect(mockFns.transactionBulkEditToolbarMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        loadedCount: 1,
        selectedCount: 1,
      }),
    )

    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: '__clear_category__' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockFns.bulkUpdateMutateMock).toHaveBeenCalledWith(
      {
        data: {
          transactionIds: [transaction.id],
          categoryId: null,
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )

    const updateOptions = mockFns.bulkUpdateMutateMock.mock.calls[0]?.[1] as
      | BulkUpdateMutateOptions
      | undefined
    updateOptions?.onSuccess?.({
      count: 1,
      transactionIds: [transaction.id],
      undo: 'undo-token',
    })

    const notification = mockFns.notificationsShowMock.mock.calls[0]?.[0] as {
      message: ReactNode
    }

    render(<MantineProvider>{notification.message}</MantineProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(mockFns.undoBulkUpdateMutateMock).toHaveBeenCalledWith(
      { data: { undo: 'undo-token' } },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )

    const undoOptions = mockFns.undoBulkUpdateMutateMock.mock.calls[0]?.[1] as
      | UndoBulkUpdateMutateOptions
      | undefined
    undoOptions?.onSuccess?.()

    expect(mockFns.invalidateQueriesMock).toHaveBeenCalledWith({
      predicate: expect.any(Function),
    })
  })

  it('uses the mobile transaction list at narrow viewports', () => {
    setMobileViewport()

    renderTransactionsPage()

    expect(screen.getByTestId('transactions-mobile-list')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeTruthy()
    expect(screen.queryByText('Add transaction')).toBeNull()
    expect(mockFns.transactionsMobileListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        totalRows: 125,
      }),
    )
  })

  it('combines mobile dates and other filters in one sheet with shortcuts and clear actions', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-12T12:00:00-07:00'))
    setMobileViewport()
    renderTransactionsPage()

    expect(screen.getByText('Filters · Feb 1–28, 2026')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Choose date range' }),
    ).toBeNull()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open transaction filters, 2 active',
      }),
    )
    act(() => vi.runAllTimers())

    expect(screen.getAllByText('Filters')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Apr' }))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('Start').value).toBe(
      '2026-04-01',
    )
    expect(screen.getByLabelText<HTMLInputElement>('End').value).toBe(
      '2026-04-30',
    )
    fireEvent.change(screen.getByLabelText('Start'), {
      target: { value: '2026-04-10' },
    })
    fireEvent.change(screen.getByLabelText('End'), {
      target: { value: '2026-04-20' },
    })
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: category.id },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Outflows' }))
    await latestInfiniteQueryOptions.queryFn({ pageParam: 0 })

    expect(mockFns.transactionControllerFindAllMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountId: 'account-1',
        categoryId: category.id,
        amountSign: 'negative',
        startDate: '2026-04-10',
        endDate: '2026-04-20',
      }),
      undefined,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear dates' }))
    await latestInfiniteQueryOptions.queryFn({ pageParam: 0 })
    const withoutDates =
      mockFns.transactionControllerFindAllMock.mock.calls.at(-1)?.[0]
    expect(withoutDates).toMatchObject({
      accountId: 'account-1',
      categoryId: category.id,
      amountSign: 'negative',
    })
    expect(withoutDates).not.toHaveProperty('startDate')
    expect(withoutDates).not.toHaveProperty('endDate')

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await latestInfiniteQueryOptions.queryFn({ pageParam: 0 })
    expect(mockFns.transactionControllerFindAllMock).toHaveBeenLastCalledWith(
      {
        pageSize: '50',
        pageIndex: '0',
        convert: true,
        sortBy: 'activityDate',
        sortOrder: 'DESC',
      },
      undefined,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    act(() => vi.runAllTimers())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Filters · All dates')).toBeTruthy()
  })
})

function makeTransaction(id: string): Transaction {
  return {
    id,
    source: TransactionSource.provider,
    userId: 'user-1',
    accountId: account.id,
    amount: {
      money: { amount: 1200, currency: 'USD' },
      sign: MoneyWithSignSign.negative,
    },
    merchantName: 'Whole Foods Market',
    providerTransactionName: 'WHOLE FOODS',
    originalDescription: 'WHOLE FOODS',
    pending: false,
    pendingTransactionId: null,
    accountOwner: null,
    externalTransactionId: 'external-1',
    logoUrl: null,
    website: null,
    merchantEntityId: null,
    paymentChannel: 'in store',
    transactionCode: null,
    counterparties: null,
    location: null,
    paymentMeta: null,
    activityDate: '2026-02-14',
    reportingDateOverride: null,
    providerDate: '2026-02-14',
    providerDatetime: null,
    authorizedDate: null,
    authorizedDatetime: null,
    categoryId: category.id,
    category,
    categoryUpdatedAt: null,
    categoryAssignmentSource: null,
    categoryAssignmentRuleId: null,
    providerCategoryHint: null,
    accountName: account.customName,
    convertedAmount: null,
    createdAt: '2026-02-14T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
  }
}
