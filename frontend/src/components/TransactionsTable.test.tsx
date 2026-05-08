import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import dayjs from 'dayjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionsTable } from './TransactionsTable'
import {
  getCategoryReviewTooltip,
  getMerchantDisplay,
  getMetadataDetails,
} from './transactions/transactionMetadata'
import type React from 'react'
import type * as SpliceAPI from '../api/clients/spliceAPI'
import type { Category, Transaction } from '../api/models'
import type { MRT_ColumnDef } from 'mantine-react-table'

const mockFns = vi.hoisted(() => ({
  useCategoryControllerFindAllMock: vi.fn(),
  useTransactionControllerUpdateMock: vi.fn(),
  useTransactionControllerUpdateCategoryMock: vi.fn(),
  useTransactionControllerUpdateCategoryReviewMock: vi.fn(),
  updateTransactionMutateMock: vi.fn(),
  updateCategoryMutateMock: vi.fn(),
  updateCategoryReviewMutateMock: vi.fn(),
  notificationsShowMock: vi.fn(),
}))

vi.mock('mantine-react-table', () => ({
  useMantineReactTable: (config: unknown) => config,
  MantineReactTable: ({
    table,
  }: {
    table: {
      columns: Array<MRT_ColumnDef<Transaction>>
      data: Array<Transaction>
    }
  }) => (
    <table>
      <tbody>
        {table.data.map((transaction) => (
          <tr key={transaction.id}>
            {table.columns.map((column) => {
              const key = String(column.id ?? column.accessorKey)
              const rendered = column.Cell
                ? column.Cell({
                    row: { original: transaction },
                    cell: {
                      getValue: () =>
                        transaction[column.accessorKey as keyof Transaction],
                    },
                  } as never)
                : column.accessorFn
                  ? column.accessorFn(transaction)
                  : null

              return <td key={key}>{rendered}</td>
            })}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}))

vi.mock('../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useCategoryControllerFindAll: mockFns.useCategoryControllerFindAllMock,
    useTransactionControllerUpdate: mockFns.useTransactionControllerUpdateMock,
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

const providerCategory = makeCategory({
  id: 'provider-category-id',
  primary: 'FOOD_AND_DRINK',
  detailed: 'FOOD_AND_DRINK_RESTAURANT',
})
const overrideCategory = makeCategory({
  id: 'override-category-id',
  primary: 'GENERAL_MERCHANDISE',
  detailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
})
const customCategory = makeCategory({
  id: 'custom-category-id',
  primary: 'Home Projects',
  detailed: 'Hardware',
  source: 'user',
})

function mockMatchMedia(supportsFineHover = false) {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches:
        supportsFineHover && query === '(hover: hover) and (pointer: fine)',
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
}

beforeEach(() => {
  mockMatchMedia()
  mockFns.useCategoryControllerFindAllMock.mockReturnValue({
    data: [providerCategory, overrideCategory, customCategory],
  })
  mockFns.useTransactionControllerUpdateCategoryMock.mockReturnValue({
    mutate: mockFns.updateCategoryMutateMock,
    isPending: false,
    variables: undefined,
  })
  mockFns.useTransactionControllerUpdateMock.mockReturnValue({
    mutate: mockFns.updateTransactionMutateMock,
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

describe('TransactionsTable', () => {
  it('renders the effective category for user overrides', () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: overrideCategory,
      }),
    ])

    expect(screen.getByText('Other General Merchandise')).toBeTruthy()
    expect(screen.queryByText('Restaurant')).toBeNull()
  })

  it('resets category overrides through the category update endpoint', () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: overrideCategory,
      }),
    ])

    fireEvent.click(screen.getByLabelText('Reset category override'))

    expect(mockFns.updateCategoryMutateMock).toHaveBeenCalledWith({
      id: 'txn-1',
      data: { categoryId: null },
    })
  })

  it('opens a category trigger initialized to the effective category and sends selections', () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: overrideCategory,
      }),
    ])

    fireEvent.click(screen.getByLabelText('Edit category'))

    expect(screen.getByLabelText('Category').textContent).toBe(
      'Other General Merchandise',
    )

    fireEvent.click(
      screen.getByRole('option', { name: 'Restaurant Food And Drink' }),
    )

    expect(mockFns.updateCategoryMutateMock).toHaveBeenCalledWith({
      id: 'txn-1',
      data: { categoryId: providerCategory.id },
    })
  })

  it('shows a User badge for custom category selector options', () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: null,
      }),
    ])

    fireEvent.click(screen.getByLabelText('Edit category'))

    expect(
      screen.getByRole('option', { name: 'Hardware Home Projects User' }),
    ).toBeTruthy()
  })

  it('marks unreviewed categories as reviewed inline', () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: null,
        categoryNeedsReview: true,
      }),
    ])

    expect(screen.getByLabelText('Category needs review')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Mark category as reviewed'))

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

  it('renders deterministic merchant metadata and removes posted status badges', () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: null,
        categoryNeedsReview: true,
        merchantName: 'Crackedan',
        providerTransactionName: 'DD *DOORDASH CRACKEDAN',
        originalDescription: 'DD *DOORDASH CRACKEDAN',
        paymentChannel: 'online',
        personalFinanceCategoryConfidenceLevel: 'HIGH',
        counterparties: [
          {
            name: 'Crackedan',
            type: 'merchant',
            confidence_level: 'LOW',
          },
          {
            name: 'DoorDash',
            type: 'marketplace',
            confidence_level: 'VERY_HIGH',
          },
        ],
      }),
    ])

    expect(screen.getByText('DoorDash · Crackedan')).toBeTruthy()
    expect(screen.getByText('DD *DOORDASH CRACKEDAN')).toBeTruthy()
    expect(screen.queryByText('Posted')).toBeNull()
  })

  it('renders amount sign styling and review status in the description cell', () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: null,
        categoryNeedsReview: true,
      }),
    ])

    expect(screen.getByText('-$12.00')).toBeTruthy()
    expect(screen.getByText('Needs review')).toBeTruthy()
    expect(screen.queryByText('Status')).toBeNull()
  })

  it('shows pending inline and exposes metadata in the info popover', async () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: null,
        merchantName: 'Shake Shack',
        originalDescription: 'SQ *SHAKE SHACK',
        paymentChannel: 'in store',
        pending: true,
        counterparties: [
          {
            name: 'Shake Shack',
            type: 'merchant',
            confidence_level: 'VERY_HIGH',
          },
          {
            name: 'Square',
            type: 'payment_terminal',
            confidence_level: 'VERY_HIGH',
          },
        ],
      }),
    ])

    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
    expect(screen.getByText('SQ *SHAKE SHACK')).toBeTruthy()

    fireEvent.click(
      screen.getByLabelText('Show transaction details for Shake Shack'),
    )

    expect(await screen.findByText('Transaction details')).toBeTruthy()
    expect(screen.getAllByText('SQ *SHAKE SHACK').length).toBeGreaterThan(1)
    expect(
      screen.getByText('Square · payment terminal · very high'),
    ).toBeTruthy()
    expect(screen.getByText(/in store/)).toBeTruthy()
  })

  it('opens metadata in the info popover on hover for desktop pointers', async () => {
    mockMatchMedia(true)

    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: null,
        merchantName: 'Shake Shack',
        originalDescription: 'SQ *SHAKE SHACK',
      }),
    ])

    fireEvent.mouseEnter(
      screen.getByLabelText('Show transaction details for Shake Shack'),
    )

    expect(await screen.findByText('Transaction details')).toBeTruthy()
    expect(screen.getAllByText('SQ *SHAKE SHACK').length).toBeGreaterThan(1)
  })

  it('does not show a metadata popover trigger for plain categorized rows', () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: null,
      }),
    ])

    expect(screen.queryByLabelText(/Show transaction details for/)).toBeNull()
  })

  it('shows an undo notification after reviewing a category inline', () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: null,
        categoryNeedsReview: true,
      }),
    ])

    fireEvent.click(screen.getByLabelText('Mark category as reviewed'))

    const reviewOptions = mockFns.updateCategoryReviewMutateMock.mock
      .calls[0]?.[1] as { onSuccess?: () => void }
    reviewOptions.onSuccess?.()

    expect(mockFns.notificationsShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Category reviewed',
        color: 'green',
      }),
    )

    const notification = mockFns.notificationsShowMock.mock.calls[0]?.[0] as {
      message: React.ReactNode
    }

    render(<MantineProvider>{notification.message}</MantineProvider>)

    expect(screen.getByText('Category marked as reviewed.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(mockFns.updateCategoryReviewMutateMock).toHaveBeenLastCalledWith({
      id: 'txn-1',
      data: { reviewed: false },
    })
  })

  it('dismisses the category selector when clicking away', () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: overrideCategory,
      }),
    ])

    fireEvent.click(screen.getByLabelText('Edit category'))
    expect(screen.getByLabelText('Search categories')).toBeTruthy()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByLabelText('Search categories')).toBeNull()
    expect(screen.queryByLabelText('Category')).toBeNull()
  })

  it('updates reporting date overrides from the inline date editor', () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: null,
      }),
    ])

    fireEvent.click(screen.getByLabelText('Edit reporting date'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(mockFns.updateTransactionMutateMock).toHaveBeenCalledWith({
      id: 'txn-1',
      data: { reportingDateOverride: '2026-02-14' },
    })
  })

  it('resets reporting date overrides from the date cell', async () => {
    renderTable([
      makeTransaction({
        category: providerCategory,
        userCategory: null,
        activityDate: '2026-03-01',
        providerDate: '2026-02-28',
        authorizedDate: '2026-02-27',
        reportingDateOverride: '2026-03-01',
      }),
    ])

    const resetButton = screen.getByLabelText('Reset reporting date override')
    fireEvent.mouseEnter(resetButton)
    expect(
      await screen.findByText('Reset to bank date: Feb 27, 2026'),
    ).toBeTruthy()

    fireEvent.click(resetButton)

    expect(mockFns.updateTransactionMutateMock).toHaveBeenCalledWith({
      id: 'txn-1',
      data: { reportingDateOverride: null },
    })
    expect(screen.getByLabelText(/Activity date Mar 1, 2026/)).toBeTruthy()
  })
})

describe('transaction metadata helpers', () => {
  it('promotes very-high marketplace counterparties ahead of provider merchants', () => {
    const transaction = makeTransaction({
      category: providerCategory,
      userCategory: null,
      merchantName: 'Crackedan',
      providerTransactionName: 'DD *DOORDASH CRACKEDAN',
      originalDescription: 'DD *DOORDASH CRACKEDAN',
      counterparties: [
        {
          name: 'DoorDash',
          type: 'marketplace',
          confidence_level: 'VERY_HIGH',
        },
      ],
    })

    expect(getMerchantDisplay(transaction)).toMatchObject({
      primary: 'DoorDash · Crackedan',
      secondary: 'DD *DOORDASH CRACKEDAN',
      marketplaceName: 'DoorDash',
    })
  })

  it('falls back to provider names and suppresses duplicate secondary text', () => {
    const transaction = makeTransaction({
      category: providerCategory,
      userCategory: null,
      merchantName: null,
      providerTransactionName: 'APPLE.COM/US',
      originalDescription: 'APPLE.COM/US',
    })

    expect(getMerchantDisplay(transaction)).toMatchObject({
      primary: 'APPLE.COM/US',
      secondary: null,
    })
  })

  it('uses metadata to explain category review hints', () => {
    const transaction = makeTransaction({
      category: providerCategory,
      userCategory: null,
      categoryNeedsReview: true,
      personalFinanceCategoryConfidenceLevel: 'LOW',
    })
    const details = getMetadataDetails(transaction)

    expect(getCategoryReviewTooltip(transaction, details)).toBe(
      'Category needs review · Plaid confidence low',
    )
  })

  it('formats midnight UTC authorization timestamps as date-only values', () => {
    const transaction = makeTransaction({
      category: providerCategory,
      userCategory: null,
      authorizedDate: '2026-05-05',
      authorizedDatetime: '2026-05-05T00:00:00.000Z',
    })

    expect(getMetadataDetails(transaction).authorizedAt).toBe('May 5, 2026')
  })

  it('keeps non-midnight authorization timestamps as localized date-times', () => {
    const authorizedDatetime = '2026-05-03T13:51:41.000Z'
    const transaction = makeTransaction({
      category: providerCategory,
      userCategory: null,
      authorizedDate: '2026-05-03',
      authorizedDatetime,
    })

    expect(getMetadataDetails(transaction).authorizedAt).toBe(
      dayjs(authorizedDatetime).format('MMM D, YYYY h:mm A'),
    )
  })
})

function renderTable(data: Array<Transaction>) {
  const queryClient = new QueryClient()

  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <TransactionsTable
          data={data}
          totalRows={data.length}
          isLoading={false}
          isError={false}
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
    description: `${overrides.primary} category`,
    source: overrides.source,
    createdAt: '2026-02-14T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
  }
}

function makeTransaction(params: {
  category: Category
  userCategory: Category | null
  categoryNeedsReview?: boolean
  merchantName?: string | null
  providerTransactionName?: string | null
  originalDescription?: string | null
  paymentChannel?: string | null
  personalFinanceCategoryConfidenceLevel?: string | null
  counterparties?: Transaction['counterparties']
  activityDate?: string
  authorizedDate?: string | null
  authorizedDatetime?: string | null
  providerDate?: string
  reportingDateOverride?: string | null
  pending?: boolean
}): Transaction {
  return {
    id: 'txn-1',
    amount: {
      money: { amount: 1200, currency: 'USD' },
      sign: 'negative',
    },
    accountId: 'account-1',
    merchantName:
      'merchantName' in params ? (params.merchantName ?? null) : 'Store',
    providerTransactionName: params.providerTransactionName ?? null,
    originalDescription: params.originalDescription ?? null,
    pending: params.pending ?? false,
    pendingTransactionId: null,
    accountOwner: null,
    externalTransactionId: 'external-1',
    logoUrl: null,
    website: null,
    merchantEntityId: null,
    paymentChannel: params.paymentChannel ?? null,
    transactionCode: null,
    personalFinanceCategoryIconUrl: null,
    personalFinanceCategoryConfidenceLevel:
      params.personalFinanceCategoryConfidenceLevel ?? null,
    counterparties: params.counterparties ?? null,
    location: null,
    paymentMeta: null,
    activityDate: params.activityDate ?? '2026-02-14',
    reportingDateOverride: params.reportingDateOverride ?? null,
    providerDate: params.providerDate ?? '2026-02-14',
    providerDatetime: null,
    authorizedDate: params.authorizedDate ?? null,
    authorizedDatetime: params.authorizedDatetime ?? null,
    categoryId: params.category.id,
    category: params.category,
    userCategoryId: params.userCategory?.id ?? null,
    userCategory: params.userCategory,
    userCategoryUpdatedAt: params.userCategory
      ? '2026-02-14T00:00:00.000Z'
      : null,
    effectiveCategoryId: params.userCategory?.id ?? params.category.id,
    effectiveCategory: params.userCategory ?? params.category,
    accountName: 'Checking',
    categoryReviewedAt: params.categoryNeedsReview
      ? null
      : '2026-02-14T00:00:00.000Z',
    categoryReviewMethod: params.categoryNeedsReview ? null : 'manual_accept',
    categoryNeedsReview: params.categoryNeedsReview ?? false,
    createdAt: '2026-02-14T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
    userId: 'user-1',
  }
}
