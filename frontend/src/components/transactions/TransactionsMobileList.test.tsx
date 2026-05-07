import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoneyWithSignSign } from '../../api/models'
import { TransactionsMobileList } from './TransactionsMobileList'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type { Category, Transaction } from '../../api/models'

const mockFns = vi.hoisted(() => ({
  notificationsShowMock: vi.fn(),
  updateCategoryMutateMock: vi.fn(),
  updateCategoryReviewMutateMock: vi.fn(),
  useCategoryControllerFindAllMock: vi.fn(),
  useTransactionControllerUpdateCategoryMock: vi.fn(),
  useTransactionControllerUpdateCategoryReviewMock: vi.fn(),
}))

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useCategoryControllerFindAll: mockFns.useCategoryControllerFindAllMock,
    useTransactionControllerUpdateCategory:
      mockFns.useTransactionControllerUpdateCategoryMock,
    useTransactionControllerUpdateCategoryReview:
      mockFns.useTransactionControllerUpdateCategoryReviewMock,
  }
})

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: mockFns.notificationsShowMock,
  },
}))

const category = makeCategory({
  id: 'category-1',
  primary: 'FOOD_AND_DRINK',
  detailed: 'FOOD_AND_DRINK_RESTAURANT',
})
const overrideCategory = makeCategory({
  id: 'category-2',
  primary: 'GENERAL_MERCHANDISE',
  detailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
})
const customCategory = makeCategory({
  id: 'category-3',
  primary: 'Home Projects',
  detailed: 'Hardware',
  source: 'user',
})

describe('TransactionsMobileList', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    Object.defineProperty(window, 'ResizeObserver', {
      value: vi.fn().mockImplementation(() => ({
        disconnect: vi.fn(),
        observe: vi.fn(),
        unobserve: vi.fn(),
      })),
      configurable: true,
    })
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
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
    mockFns.useCategoryControllerFindAllMock.mockReturnValue({
      data: [category, overrideCategory, customCategory],
    })
    mockFns.useTransactionControllerUpdateCategoryMock.mockReturnValue({
      mutate: mockFns.updateCategoryMutateMock,
      isPending: false,
      variables: undefined,
    })
    mockFns.useTransactionControllerUpdateCategoryReviewMock.mockReturnValue({
      mutate: mockFns.updateCategoryReviewMutateMock,
      isPending: false,
      variables: undefined,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('groups transactions by date and renders compact row details', () => {
    renderMobileList([
      makeTransaction({
        id: 'txn-1',
        date: '2026-05-07',
        merchantName: 'Whole Foods Market',
        amount: 6824,
        sign: MoneyWithSignSign.negative,
        pending: true,
      }),
      makeTransaction({
        id: 'txn-2',
        date: '2026-05-06',
        merchantName: 'Salary',
        amount: 215000,
        sign: MoneyWithSignSign.positive,
        categoryNeedsReview: true,
      }),
    ])

    expect(screen.getByText('May 7, 2026')).toBeTruthy()
    expect(screen.getByText('May 6, 2026')).toBeTruthy()
    expect(screen.getByText('Whole Foods Market')).toBeTruthy()
    expect(screen.getByText('Salary')).toBeTruthy()
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('Needs review')).toBeTruthy()
    expect(screen.getByText('-$68.24')).toBeTruthy()
    expect(screen.getByText('$2,150.00')).toBeTruthy()
  })

  it('requests more rows when scrolled near the bottom', () => {
    const onScrollNearBottom = vi.fn()
    renderMobileList([makeTransaction({ id: 'txn-1' })], {
      onScrollNearBottom,
    })

    const list = screen.getByLabelText('Transactions list, 1 total')
    Object.defineProperty(list, 'scrollHeight', {
      configurable: true,
      value: 1000,
    })
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      value: 700,
    })
    Object.defineProperty(list, 'clientHeight', {
      configurable: true,
      value: 250,
    })

    fireEvent.scroll(list)

    expect(onScrollNearBottom).toHaveBeenCalled()
  })

  it('opens transaction details from the full row', async () => {
    renderMobileList([
      makeTransaction({
        id: 'txn-1',
        merchantName: 'Whole Foods Market',
        originalDescription: 'WHOLE FOODS #102',
        paymentChannel: 'in store',
        providerTransactionName: 'WHOLE FOODS MARKET',
      }),
    ])

    expect(
      screen.queryByLabelText('Open transaction actions for Whole Foods Market'),
    ).toBeNull()

    fireEvent.click(
      screen.getByRole('button', {
        name: /Open transaction details for Whole Foods Market/,
      }),
    )

    expect(await screen.findByLabelText('Search categories')).toBeTruthy()
    expect(screen.getByText('Raw description')).toBeTruthy()
    expect(screen.getByText('WHOLE FOODS #102')).toBeTruthy()
    expect(screen.getByText('Provider name')).toBeTruthy()
    expect(screen.getByText('WHOLE FOODS MARKET')).toBeTruthy()
  })

  it('marks an unreviewed category as reviewed from the actions drawer', async () => {
    renderMobileList([
      makeTransaction({
        id: 'txn-1',
        merchantName: 'Salary',
        categoryNeedsReview: true,
      }),
    ])

    fireEvent.click(
      screen.getByRole('button', { name: /Open transaction details for Salary/ }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Mark reviewed' }))

    expect(mockFns.updateCategoryReviewMutateMock).toHaveBeenCalledWith(
      {
        id: 'txn-1',
        data: { reviewed: true },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    )
  })

  it('resets category overrides from the actions drawer', async () => {
    renderMobileList([
      makeTransaction({
        id: 'txn-1',
        merchantName: 'Store',
        userCategory: overrideCategory,
      }),
    ])

    fireEvent.click(
      screen.getByRole('button', { name: /Open transaction details for Store/ }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Reset override' }))

    expect(mockFns.updateCategoryMutateMock).toHaveBeenCalledWith({
      id: 'txn-1',
      data: { categoryId: null },
    })
  })

  it('updates the category from the actions drawer', async () => {
    renderMobileList([
      makeTransaction({
        id: 'txn-1',
        merchantName: 'Store',
      }),
    ])

    fireEvent.click(
      screen.getByRole('button', { name: /Open transaction details for Store/ }),
    )
    fireEvent.click(
      await screen.findByRole('option', {
        name: 'Hardware Home Projects User',
      }),
    )

    expect(mockFns.updateCategoryMutateMock).toHaveBeenCalledWith({
      id: 'txn-1',
      data: { categoryId: customCategory.id },
    })
  })
})

function renderMobileList(
  data: Array<Transaction>,
  options: { onScrollNearBottom?: () => void } = {},
) {
  const queryClient = new QueryClient()

  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <TransactionsMobileList
          data={data}
          totalRows={data.length}
          isLoading={false}
          isError={false}
          onScrollNearBottom={options.onScrollNearBottom}
        />
      </QueryClientProvider>
    </MantineProvider>,
  )
}

function makeCategory(overrides: {
  id: string
  primary: string
  detailed: string
  source?: Category['source']
}): Category {
  return {
    id: overrides.id,
    primary: overrides.primary,
    detailed: overrides.detailed,
    description: 'Category',
    source: overrides.source ?? 'plaid',
    userId: null,
    archivedAt: null,
    createdAt: '2026-02-14T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
  }
}

function makeTransaction(
  overrides: Partial<{
    amount: number
    categoryNeedsReview: boolean
    date: string
    id: string
    merchantName: string
    originalDescription: string | null
    paymentChannel: string | null
    pending: boolean
    providerTransactionName: string | null
    sign: MoneyWithSignSign
    userCategory: Category | null
  }> = {},
): Transaction {
  const userCategory =
    'userCategory' in overrides ? (overrides.userCategory ?? null) : null

  return {
    id: overrides.id ?? 'txn-1',
    amount: {
      money: { amount: overrides.amount ?? 1200, currency: 'USD' },
      sign: overrides.sign ?? MoneyWithSignSign.negative,
    },
    accountId: 'account-1',
    merchantName: overrides.merchantName ?? 'Store',
    providerTransactionName: overrides.providerTransactionName ?? null,
    originalDescription: overrides.originalDescription ?? null,
    pending: overrides.pending ?? false,
    pendingTransactionId: null,
    accountOwner: null,
    externalTransactionId: 'external-1',
    logoUrl: null,
    website: null,
    merchantEntityId: null,
    paymentChannel: overrides.paymentChannel ?? null,
    transactionCode: null,
    personalFinanceCategoryIconUrl: null,
    personalFinanceCategoryConfidenceLevel: null,
    counterparties: null,
    location: null,
    paymentMeta: null,
    date: overrides.date ?? '2026-05-07',
    datetime: null,
    authorizedDate: null,
    authorizedDatetime: null,
    categoryId: category.id,
    category,
    userCategoryId: userCategory?.id ?? null,
    userCategory,
    userCategoryUpdatedAt: userCategory
      ? '2026-02-14T00:00:00.000Z'
      : null,
    effectiveCategoryId: userCategory?.id ?? category.id,
    effectiveCategory: userCategory ?? category,
    accountName: 'Checking',
    categoryReviewedAt: overrides.categoryNeedsReview
      ? null
      : '2026-02-14T00:00:00.000Z',
    categoryReviewMethod: overrides.categoryNeedsReview
      ? null
      : 'manual_accept',
    categoryNeedsReview: overrides.categoryNeedsReview ?? false,
    createdAt: '2026-02-14T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
    userId: 'user-1',
  }
}
