import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoneyWithSignSign } from '../../api/models'
import { TransactionsMobileList } from './TransactionsMobileList'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type { Category, Transaction } from '../../api/models'

const mockFns = vi.hoisted(() => ({
  updateTransactionMutateMock: vi.fn(),
  updateCategoryMutateMock: vi.fn(),
  useCategoryControllerFindAllMock: vi.fn(),
  useTransactionControllerUpdateMock: vi.fn(),
  useTransactionControllerUpdateCategoryMock: vi.fn(),
}))

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useCategoryControllerFindAll: mockFns.useCategoryControllerFindAllMock,
    useTransactionControllerUpdate: mockFns.useTransactionControllerUpdateMock,
    useTransactionControllerUpdateCategory:
      mockFns.useTransactionControllerUpdateCategoryMock,
  }
})

const foodCategory = makeCategory({
  id: 'category-1',
  primary: 'Food',
  detailed: 'Restaurants',
})
const hardwareCategory = makeCategory({
  id: 'category-2',
  primary: 'Home Projects',
  detailed: 'Hardware',
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
    mockFns.useCategoryControllerFindAllMock.mockReturnValue({
      data: [foodCategory, hardwareCategory],
    })
    mockFns.useTransactionControllerUpdateMock.mockReturnValue({
      mutate: mockFns.updateTransactionMutateMock,
      isPending: false,
      variables: undefined,
    })
    mockFns.useTransactionControllerUpdateCategoryMock.mockReturnValue({
      mutate: mockFns.updateCategoryMutateMock,
      isPending: false,
      variables: undefined,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders uncategorized rows with provider hint metadata and no review badge', () => {
    renderMobileList([
      makeTransaction({
        id: 'txn-1',
        category: null,
        providerCategoryHint: {
          provider: 'plaid',
          primary: 'FOOD_AND_DRINK',
          detailed: 'FOOD_AND_DRINK_RESTAURANT',
          displayLabel: 'Restaurants',
          confidenceLevel: 'HIGH',
          iconUrl: null,
        },
      }),
    ])

    expect(screen.getByLabelText('Checking · Uncategorized')).toBeTruthy()
    expect(screen.queryByText(/Provider hint:/)).toBeNull()
    expect(screen.queryByText('Needs review')).toBeNull()
  })

  it('updates and clears categories from the details drawer', async () => {
    renderMobileList([
      makeTransaction({
        id: 'txn-1',
        category: foodCategory,
      }),
    ])

    fireEvent.click(
      screen.getByRole('button', {
        name: /Open transaction details for Store/,
      }),
    )
    fireEvent.click((await screen.findAllByLabelText('Category'))[0])
    const hardwareOption = screen
      .getByText('Hardware')
      .closest('[role="option"]')
    expect(hardwareOption).toBeTruthy()
    fireEvent.click(hardwareOption as HTMLElement)

    expect(mockFns.updateCategoryMutateMock).toHaveBeenCalledWith({
      id: 'txn-1',
      data: { categoryId: hardwareCategory.id },
    })

    fireEvent.click((await screen.findAllByLabelText('Category'))[0])
    fireEvent.click(await screen.findByRole('button', { name: /clear/i }))

    expect(mockFns.updateCategoryMutateMock).toHaveBeenLastCalledWith({
      id: 'txn-1',
      data: { categoryId: null },
    })
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull()
  })

  it('uses checkboxes for bulk selection and opens read-only details from rows', async () => {
    const onToggle = vi.fn()

    renderMobileList(
      [
        makeTransaction({
          id: 'txn-1',
          category: foodCategory,
          merchantName: 'Provider Store',
          source: 'provider',
        }),
        makeTransaction({
          id: 'manual-txn',
          category: foodCategory,
          merchantName: 'Manual Store',
          source: 'manual',
        }),
      ],
      {
        bulkModeEnabled: true,
        selectedTransactionIds: new Set(['txn-1']),
        onToggleTransactionSelection: onToggle,
      },
    )

    const checkbox = screen.getByRole('checkbox', {
      name: /Select transaction Provider Store/,
    })

    expect((checkbox as HTMLInputElement).checked).toBe(true)
    expect(
      screen.queryByRole('checkbox', {
        name: /Select transaction Manual Store/,
      }),
    ).toBeNull()

    fireEvent.click(checkbox)

    expect(onToggle).toHaveBeenCalledWith('txn-1')

	    fireEvent.click(
	      screen.getByRole('button', {
	        name: /Open transaction details for Provider Store/,
	      }),
	    )

    expect(await screen.findByText('Display')).toBeTruthy()
    expect(screen.queryByLabelText('Reporting date')).toBeNull()
    expect(screen.queryByLabelText('Category')).toBeNull()
  })

  it('shows manual edit and delete actions only in manual transaction details', async () => {
    const onEditManualTransaction = vi.fn()
    const onDeleteManualTransaction = vi.fn()
    const manualTransaction = makeTransaction({
      id: 'manual-txn',
      category: foodCategory,
      source: 'manual',
    })
    const providerTransaction = makeTransaction({
      id: 'provider-txn',
      category: foodCategory,
      source: 'provider',
    })

    renderMobileList([manualTransaction], {
      onEditManualTransaction,
      onDeleteManualTransaction,
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: /Open transaction details for Store/,
      }),
    )
    fireEvent.click(await screen.findByLabelText('Edit manual transaction'))

    expect(onEditManualTransaction).toHaveBeenCalledWith(manualTransaction)
    expect(screen.queryByLabelText('Category')).toBeNull()

    cleanup()

    renderMobileList([manualTransaction], {
      onEditManualTransaction,
      onDeleteManualTransaction,
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: /Open transaction details for Store/,
      }),
    )
    fireEvent.click(await screen.findByLabelText('Delete manual transaction'))

    expect(onDeleteManualTransaction).toHaveBeenCalledWith(manualTransaction)

    cleanup()

    renderMobileList([providerTransaction], {
      onEditManualTransaction,
      onDeleteManualTransaction,
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: /Open transaction details for Store/,
      }),
    )

    expect(screen.queryByLabelText('Edit manual transaction')).toBeNull()
    expect(screen.queryByLabelText('Delete manual transaction')).toBeNull()
  })

  it('updates reporting date overrides from the details drawer', async () => {
    renderMobileList([
      makeTransaction({
        id: 'txn-1',
        category: foodCategory,
        activityDate: '2026-04-29',
      }),
    ])

    fireEvent.click(
      screen.getByRole('button', {
        name: /Open transaction details for Store/,
      }),
    )
    const input = await screen.findByLabelText('Reporting date')
    fireEvent.change(input, { target: { value: '2026-05-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply date' }))

    expect(mockFns.updateTransactionMutateMock).toHaveBeenCalledWith({
      id: 'txn-1',
      data: { reportingDateOverride: '2026-05-01' },
    })
  })

  it('shows original currency amounts in the details drawer', async () => {
    renderMobileList([
      makeTransaction({
        id: 'txn-1',
        category: foodCategory,
        amount: {
          money: { amount: 1200, currency: 'EUR' },
          sign: MoneyWithSignSign.negative,
        },
        convertedAmount: {
          money: { amount: 1300, currency: 'USD' },
          sign: MoneyWithSignSign.negative,
        },
      }),
    ])

    fireEvent.click(
      screen.getByRole('button', {
        name: /Open transaction details for Store/,
      }),
    )

    expect(await screen.findByText('Original EUR -€12.00')).toBeTruthy()
  })
})

function renderMobileList(
  data: Array<Transaction>,
  options: {
    bulkModeEnabled?: boolean
    selectedTransactionIds?: Set<string>
    onToggleTransactionSelection?: (transactionId: string) => void
    onEditManualTransaction?: (transaction: Transaction) => void
    onDeleteManualTransaction?: (transaction: Transaction) => void
  } = {},
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
          bulkModeEnabled={options.bulkModeEnabled}
          selectedTransactionIds={options.selectedTransactionIds}
          onToggleTransactionSelection={options.onToggleTransactionSelection}
          onEditManualTransaction={options.onEditManualTransaction}
          onDeleteManualTransaction={options.onDeleteManualTransaction}
        />
      </QueryClientProvider>
    </MantineProvider>,
  )
}

function makeCategory(overrides: {
  id: string
  primary: string
  detailed: string
}): Category {
  return {
    id: overrides.id,
    primary: overrides.primary,
    detailed: overrides.detailed,
    description: 'Category',
    color: '#228be6',
    archivedAt: null,
    createdAt: '2026-02-14T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
  }
}

function makeTransaction(
  overrides: Partial<{
    amount: Transaction['amount']
    activityDate: string
	    category: Category | null
	    convertedAmount: Transaction['convertedAmount']
	    id: string
	    merchantName: string
	    providerCategoryHint: {
      provider: 'plaid'
      primary: string | null
      detailed: string | null
      displayLabel: string | null
      confidenceLevel: string | null
      iconUrl: string | null
    } | null
    source: 'manual' | 'provider'
  }> = {},
): Transaction {
  const category =
    'category' in overrides ? (overrides.category ?? null) : foodCategory

  return {
    id: overrides.id ?? 'txn-1',
    amount: overrides.amount ?? {
      money: { amount: 1200, currency: 'USD' },
      sign: MoneyWithSignSign.negative,
    },
	    accountId: 'account-1',
	    merchantName: overrides.merchantName ?? 'Store',
    providerTransactionName: null,
    originalDescription: null,
    pending: false,
    pendingTransactionId: null,
    accountOwner: null,
    externalTransactionId: 'external-1',
    logoUrl: null,
    website: null,
    merchantEntityId: null,
    paymentChannel: null,
    transactionCode: null,
    counterparties: null,
    location: null,
    paymentMeta: null,
    activityDate: overrides.activityDate ?? '2026-05-07',
    reportingDateOverride: null,
    providerDate: overrides.activityDate ?? '2026-05-07',
    providerDatetime: null,
    authorizedDate: null,
    authorizedDatetime: null,
    categoryId: category?.id ?? null,
    category,
    categoryUpdatedAt: null,
    accountName: 'Checking',
    createdAt: '2026-02-14T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
    userId: 'user-1',
    providerCategoryHint: overrides.providerCategoryHint ?? null,
    convertedAmount: overrides.convertedAmount,
    ...(overrides.source ? { source: overrides.source } : {}),
  } as Transaction
}
