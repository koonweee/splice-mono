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

    expect(screen.getByText(/Checking .* Uncategorized/)).toBeTruthy()
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

  it('keeps bulk mode row selection behavior', () => {
    const onToggle = vi.fn()

    renderMobileList(
      [makeTransaction({ id: 'txn-1', category: foodCategory })],
      {
        bulkModeEnabled: true,
        selectedTransactionIds: new Set(['txn-1']),
        onToggleTransactionSelection: onToggle,
      },
    )

    const checkbox = screen.getByRole('checkbox', {
      name: /Select transaction Store/,
    })

    expect((checkbox as HTMLInputElement).checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /Select transaction/ }))

    expect(onToggle).toHaveBeenCalledWith('txn-1')
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
})

function renderMobileList(
  data: Array<Transaction>,
  options: {
    bulkModeEnabled?: boolean
    selectedTransactionIds?: Set<string>
    onToggleTransactionSelection?: (transactionId: string) => void
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
    archivedAt: null,
    createdAt: '2026-02-14T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
  }
}

function makeTransaction(
  overrides: Partial<{
    activityDate: string
    category: Category | null
    id: string
    providerCategoryHint: {
      provider: 'plaid'
      primary: string | null
      detailed: string | null
      displayLabel: string | null
      confidenceLevel: string | null
      iconUrl: string | null
    } | null
  }> = {},
): Transaction {
  const category =
    'category' in overrides ? (overrides.category ?? null) : foodCategory

  return {
    id: overrides.id ?? 'txn-1',
    amount: {
      money: { amount: 1200, currency: 'USD' },
      sign: MoneyWithSignSign.negative,
    },
    accountId: 'account-1',
    merchantName: 'Store',
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
  }
}
