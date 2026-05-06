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
  useCategoryControllerFindAllMock: vi.fn(),
  useTransactionControllerBulkReviewCategoriesMock: vi.fn(),
  useTransactionControllerUndoBulkReviewCategoriesMock: vi.fn(),
  bulkReviewMutateMock: vi.fn(),
  undoBulkReviewMutateMock: vi.fn(),
  transactionControllerFindAllMock: vi.fn(),
  transactionsTableMock: vi.fn(),
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
        typeof option === 'string'
          ? { value: option, label: option }
          : option,
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
  DatePickerInput: ({ placeholder }: { placeholder?: string }) => (
    <div>{placeholder}</div>
  ),
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
    useCategoryControllerFindAll: mockFns.useCategoryControllerFindAllMock,
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

let latestInfiniteQueryOptions: InfiniteQueryOptions
const transactionsPage =
  (Route as unknown as { component: ComponentType }).component

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
  createdAt: '2026-02-14T00:00:00.000Z',
  updatedAt: '2026-02-14T00:00:00.000Z',
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
  mockFns.useCategoryControllerFindAllMock.mockReturnValue({
    data: [category],
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
  it('sends the review status in transaction query params and counts bulk review from total rows', async () => {
    renderTransactionsPage()

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

  it('bulk reviews current filters and exposes undo with returned transaction IDs', () => {
    renderTransactionsPage()

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
})
