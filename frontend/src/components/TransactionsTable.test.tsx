import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionsTable } from './TransactionsTable'
import type React from 'react'
import type * as SpliceAPI from '../api/clients/spliceAPI'
import type { Category, Transaction } from '../api/models'
import type { MRT_ColumnDef } from 'mantine-react-table'

const mockFns = vi.hoisted(() => ({
  useCategoryControllerFindAllMock: vi.fn(),
  useTransactionControllerUpdateMock: vi.fn(),
  useTransactionControllerUpdateCategoryMock: vi.fn(),
  updateTransactionMutateMock: vi.fn(),
  updateCategoryMutateMock: vi.fn(),
}))

vi.mock('mantine-react-table', () => ({
  useMantineReactTable: (config: unknown) => config,
  MantineReactTable: ({
    table,
  }: {
    table: {
      columns: Array<MRT_ColumnDef<Transaction>>
      data: Array<Transaction>
      mantineTableBodyRowProps?: (props: {
        row: { original: Transaction }
      }) => React.HTMLAttributes<HTMLTableRowElement>
    }
  }) => (
    <table>
      <thead>
        <tr>
          {table.columns.map((column) => {
            const key = String(column.id ?? column.accessorKey)
            const Header = (
              column as MRT_ColumnDef<Transaction> & {
                Header?: () => React.ReactNode
              }
            ).Header

            return <th key={key}>{Header ? <Header /> : column.header}</th>
          })}
        </tr>
      </thead>
      <tbody>
        {table.data.map((transaction) => {
          const row = { original: transaction }

          return (
            <tr
              key={transaction.id}
              {...table.mantineTableBodyRowProps?.({ row })}
            >
              {table.columns.map((column) => {
                const key = String(column.id ?? column.accessorKey)
                const rendered = column.Cell
                  ? column.Cell({
                      row,
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
          )
        })}
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
  }
})

const foodCategory = makeCategory({
  id: 'food-category-id',
  primary: 'Food',
  detailed: 'Restaurants',
})
const hardwareCategory = makeCategory({
  id: 'hardware-category-id',
  primary: 'Home Projects',
  detailed: 'Hardware',
})

function mockMatchMedia() {
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
      disconnect: vi.fn(),
      observe: vi.fn(),
      unobserve: vi.fn(),
    })),
    configurable: true,
  })
}

beforeEach(() => {
  mockMatchMedia()
  mockFns.useCategoryControllerFindAllMock.mockReturnValue({
    data: [foodCategory, hardwareCategory],
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
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TransactionsTable', () => {
  it('displays uncategorized transactions and provider hints only when uncategorized', async () => {
    renderTable([
      makeTransaction({
        id: 'uncategorized',
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
      makeTransaction({
        id: 'categorized',
        category: foodCategory,
        providerCategoryHint: {
          provider: 'plaid',
          primary: 'FOOD_AND_DRINK',
          detailed: 'FOOD_AND_DRINK_RESTAURANT',
          displayLabel: 'Provider Restaurants',
          confidenceLevel: 'LOW',
          iconUrl: null,
        },
      }),
    ])

    expect(screen.getByText('Uncategorized')).toBeTruthy()
    const hintButton = screen.getByLabelText(
      'Provider category hint: Restaurants',
    )
    expect(hintButton).toBeTruthy()
    fireEvent.mouseEnter(hintButton)
    await waitFor(() => expect(screen.getByText('Restaurants')).toBeTruthy())
    expect(
      screen.queryByLabelText('Provider category hint: Provider Restaurants'),
    ).toBeNull()
  })

  it('edits assigned categories from user category options', () => {
    renderTable([makeTransaction({ category: foodCategory })])

    fireEvent.click(screen.getByLabelText('Edit category'))

    const categoryInput = screen
      .getAllByLabelText('Category')
      .find((element) => element.tagName === 'INPUT') as HTMLInputElement
    fireEvent.click(categoryInput)
    expect(categoryInput.value).toBe('Restaurants - Food')
    const hardwareOption = screen
      .getByText('Hardware')
      .closest('[role="option"]')
    expect(hardwareOption).toBeTruthy()

    fireEvent.click(hardwareOption as HTMLElement)

    expect(mockFns.updateCategoryMutateMock).toHaveBeenCalledWith({
      id: 'txn-1',
      data: { categoryId: hardwareCategory.id },
    })
    expect(screen.queryByText('User')).toBeNull()
  })

  it('clears assigned categories and has no review action', () => {
    renderTable([makeTransaction({ category: foodCategory })])

    fireEvent.click(screen.getByLabelText('Clear category'))

    expect(mockFns.updateCategoryMutateMock).toHaveBeenCalledWith({
      id: 'txn-1',
      data: { categoryId: null },
    })
    expect(screen.queryByLabelText('Mark category as reviewed')).toBeNull()
  })

  it('keeps bulk selection behavior without category edit affordances', () => {
    const onToggle = vi.fn()
    const onToggleLoaded = vi.fn()

    renderTable([makeTransaction({ category: foodCategory })], {
      bulkModeEnabled: true,
      selectedTransactionIds: new Set(['txn-1']),
      onToggleTransactionSelection: onToggle,
      onToggleLoadedSelection: onToggleLoaded,
    })

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Select transaction Store/ }),
    )
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select all loaded transactions' }),
    )

    expect(onToggle).toHaveBeenCalledWith('txn-1')
    expect(onToggleLoaded).toHaveBeenCalledOnce()
    expect(screen.queryByLabelText('Edit category')).toBeNull()
  })
})

function renderTable(
  data: Array<Transaction>,
  props: Partial<React.ComponentProps<typeof TransactionsTable>> = {},
) {
  const queryClient = new QueryClient()

  return render(
    <MantineProvider>
      <QueryClientProvider client={queryClient}>
        <TransactionsTable
          data={data}
          totalRows={data.length}
          isLoading={false}
          isError={false}
          {...props}
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
    description: `${overrides.primary} category`,
    createdAt: '2026-02-14T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
  }
}

function makeTransaction(
  params: {
    id?: string
    category: Category | null
    providerCategoryHint?: {
      provider: 'plaid'
      primary: string | null
      detailed: string | null
      displayLabel: string | null
      confidenceLevel: string | null
      iconUrl: string | null
    } | null
  } = { category: foodCategory },
): Transaction {
  const category = params.category

  return {
    id: params.id ?? 'txn-1',
    amount: {
      money: { amount: 1200, currency: 'USD' },
      sign: 'negative',
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
    activityDate: '2026-02-14',
    reportingDateOverride: null,
    providerDate: '2026-02-14',
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
    providerCategoryHint: params.providerCategoryHint ?? null,
  }
}
