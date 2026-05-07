import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../../api/models'
import { Route } from './transactions'
import type { ComponentType, ReactNode } from 'react'
import type * as Mantine from '@mantine/core'
import type * as ReactQuery from '@tanstack/react-query'
import type * as ReactRouter from '@tanstack/react-router'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type {
  Account,
  BulkTransactionCategoryReviewResponse,
  Category,
  PaginatedTransactionResponse,
} from '../../api/models'

type InfiniteQueryOptions = {
  queryFn: (context: { pageParam?: number }) => unknown
}

type BulkReviewMutateOptions = {
  onSuccess?: (result: BulkTransactionCategoryReviewResponse) => void
}

type UndoBulkReviewMutateOptions = {
  onSuccess?: () => void
}

const mockFns = vi.hoisted(() => ({
  useSearchMock: vi.fn(),
  useInfiniteQueryMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  useAccountControllerFindAllMock: vi.fn(),
  useCategoryControllerFindFilterOptionsMock: vi.fn(),
  useTransactionControllerGetSummaryMock: vi.fn(),
  useTransactionControllerBulkReviewCategoriesMock: vi.fn(),
  useTransactionControllerUndoBulkReviewCategoriesMock: vi.fn(),
  bulkReviewMutateMock: vi.fn(),
  undoBulkReviewMutateMock: vi.fn(),
  transactionControllerFindAllMock: vi.fn(),
  transactionsTableMock: vi.fn(),
  transactionsMobileListMock: vi.fn(),
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
      value,
    }: SelectMockProps) => {
      const options = data.map((option) =>
        typeof option === 'string' ? { value: option, label: option } : option,
      )

      return (
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

vi.mock('@mantine/dates', () => ({
  DatePicker: () => <div>Calendar</div>,
}))

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
    useCategoryControllerFindFilterOptions:
      mockFns.useCategoryControllerFindFilterOptionsMock,
    useTransactionControllerGetSummary:
      mockFns.useTransactionControllerGetSummaryMock,
    useTransactionControllerBulkReviewCategories:
      mockFns.useTransactionControllerBulkReviewCategoriesMock,
    useTransactionControllerUndoBulkReviewCategories:
      mockFns.useTransactionControllerUndoBulkReviewCategoriesMock,
  }
})

vi.mock('@/components/TransactionsTable', () => ({
  TransactionsTable: (props: unknown) => {
    mockFns.transactionsTableMock(props)

    return <div data-testid="transactions-table" />
  },
}))

vi.mock('@/components/transactions/TransactionsMobileList', () => ({
  TransactionsMobileList: (props: unknown) => {
    mockFns.transactionsMobileListMock(props)

    return <div data-testid="transactions-mobile-list" />
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
  subType: null,
  externalAccountId: null,
  bankLinkId: null,
  bankLink: null,
  createdAt: '2026-02-14T00:00:00.000Z',
  updatedAt: '2026-02-14T00:00:00.000Z',
}

const category: Category = {
  id: 'category-1',
  primary: 'FOOD_AND_DRINK',
  detailed: 'FOOD_AND_DRINK_RESTAURANT',
  description: 'Food category',
  source: 'plaid',
  userId: null,
  archivedAt: null,
  createdAt: '2026-02-14T00:00:00.000Z',
  updatedAt: '2026-02-14T00:00:00.000Z',
}

const hiddenCategory: Category = {
  ...category,
  id: 'category-2',
  primary: 'Hidden Primary',
  detailed: 'Hidden Detail',
  source: 'user',
  userId: 'user-1',
}

const transactionsPageData: PaginatedTransactionResponse = {
  data: [],
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
      }
    },
  )
  mockFns.transactionControllerFindAllMock.mockResolvedValue(
    transactionsPageData,
  )
  mockFns.useAccountControllerFindAllMock.mockReturnValue({
    data: [account],
  })
  mockFns.useCategoryControllerFindFilterOptionsMock.mockReturnValue({
    data: [category, hiddenCategory],
  })
  mockFns.useTransactionControllerGetSummaryMock.mockReturnValue({
    data: {
      currency: 'USD',
      inflow: {
        money: { amount: 250000, currency: 'USD' },
        sign: MoneyWithSignSign.positive,
      },
      outflow: {
        money: { amount: 101700, currency: 'USD' },
        sign: MoneyWithSignSign.negative,
      },
      net: {
        money: { amount: 148300, currency: 'USD' },
        sign: MoneyWithSignSign.positive,
      },
      transactionCount: 125,
      pendingCount: 4,
      needsReviewCount: 12,
    },
    isError: false,
    isLoading: false,
  })
  mockFns.useTransactionControllerBulkReviewCategoriesMock.mockReturnValue({
    mutate: mockFns.bulkReviewMutateMock,
    isPending: false,
  })
  mockFns.useTransactionControllerUndoBulkReviewCategoriesMock.mockReturnValue({
    mutate: mockFns.undoBulkReviewMutateMock,
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
  vi.clearAllMocks()
})

describe('TransactionsPage category review workflow', () => {
  it('exposes an accessible icon-only filters trigger', () => {
    renderTransactionsPage()

    expect(
      screen.getByRole('button', { name: /Open transaction filters/ }),
    ).toBeTruthy()
  })

  it('keeps hidden categories available in historical transaction filters', () => {
    renderTransactionsPage()

    expect(
      mockFns.useCategoryControllerFindFilterOptionsMock,
    ).toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', { name: /Open transaction filters/ }),
    )

    expect(screen.getByRole('option', { name: 'Hidden Primary' })).toBeTruthy()
  })

  it('does not show default categories omitted from filter options', () => {
    mockFns.useCategoryControllerFindFilterOptionsMock.mockReturnValue({
      data: [hiddenCategory],
    })

    renderTransactionsPage()

    fireEvent.click(
      screen.getByRole('button', { name: /Open transaction filters/ }),
    )

    expect(screen.queryByRole('option', { name: 'Food And Drink' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Uncategorized' })).toBeTruthy()
  })

  it('sends the review status in transaction query params and counts bulk review from total rows', async () => {
    renderTransactionsPage()

    fireEvent.click(
      screen.getByRole('button', { name: /Open transaction filters/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Needs review' }))

    expect(
      screen.getByRole('button', { name: 'Mark 125 as reviewed' }),
    ).toBeTruthy()

    await latestInfiniteQueryOptions.queryFn({ pageParam: 2 })

    expect(mockFns.transactionControllerFindAllMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-1',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        categoryReviewStatus: 'needs_review',
        pageIndex: '2',
        pageSize: '50',
      }),
    )
  })

  it('requests filtered summary params and renders summary totals', () => {
    renderTransactionsPage()

    expect(mockFns.useTransactionControllerGetSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-1',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        convert: true,
      }),
    )
    expect(screen.getByLabelText('Transaction summary')).toBeTruthy()
    expect(screen.getByText('$2,500.00')).toBeTruthy()
    expect(screen.getByText('-$1,017.00')).toBeTruthy()
    expect(screen.getByText('125')).toBeTruthy()
  })

  it('uses the mobile transaction list at narrow viewports', () => {
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

    renderTransactionsPage()

    expect(screen.getByTestId('transactions-mobile-list')).toBeTruthy()
    expect(mockFns.transactionsMobileListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        totalRows: 125,
      }),
    )
  })

  it('bulk reviews current filters and exposes undo with returned transaction IDs', () => {
    renderTransactionsPage()

    fireEvent.click(
      screen.getByRole('button', { name: /Open transaction filters/ }),
    )
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'FOOD_AND_DRINK' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Outflows' }))
    fireEvent.click(screen.getByRole('button', { name: 'Needs review' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark 125 as reviewed' }),
    )

    expect(mockFns.bulkReviewMutateMock).toHaveBeenCalledWith(
      {
        data: {
          filters: {
            accountId: 'account-1',
            startDate: '2026-02-01',
            endDate: '2026-02-28',
            categoryPrimary: 'FOOD_AND_DRINK',
            amountSign: 'negative',
            categoryReviewStatus: 'needs_review',
          },
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    )

    const reviewOptions = mockFns.bulkReviewMutateMock.mock.calls[0]?.[1] as
      | BulkReviewMutateOptions
      | undefined
    reviewOptions?.onSuccess?.({
      count: 3,
      transactionIds: ['txn-1', 'txn-2', 'txn-3'],
    })

    expect(mockFns.notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Categories reviewed',
        color: 'green',
      }),
    )

    const notification = mockFns.notificationsShowMock.mock.calls[0]?.[0] as {
      message: ReactNode
    }

    render(<MantineProvider>{notification.message}</MantineProvider>)

    expect(screen.getByText('Marked 3 transactions as reviewed.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(mockFns.undoBulkReviewMutateMock).toHaveBeenCalledWith(
      {
        data: { transactionIds: ['txn-1', 'txn-2', 'txn-3'] },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    )

    const undoOptions = mockFns.undoBulkReviewMutateMock.mock.calls[0]?.[1] as
      | UndoBulkReviewMutateOptions
      | undefined
    undoOptions?.onSuccess?.()

    expect(mockFns.invalidateQueriesMock).toHaveBeenCalledWith({
      predicate: expect.any(Function),
    })
  })

  it('clears hidden filters and active filter indicators from the filter panel', async () => {
    renderTransactionsPage()

    fireEvent.click(
      screen.getByRole('button', { name: /Open transaction filters/ }),
    )
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'FOOD_AND_DRINK' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Outflows' }))
    fireEvent.click(screen.getByRole('button', { name: 'Needs review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(
      screen.getByRole('button', { name: 'Open transaction filters' }),
    ).toBeTruthy()

    await latestInfiniteQueryOptions.queryFn({ pageParam: 0 })

    expect(mockFns.transactionControllerFindAllMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        accountId: expect.any(String),
        amountSign: expect.any(String),
        categoryPrimary: expect.any(String),
        categoryReviewStatus: expect.any(String),
        endDate: expect.any(String),
        startDate: expect.any(String),
      }),
    )
  })
})
