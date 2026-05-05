import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionsTable } from './TransactionsTable'
import type * as SpliceAPI from '../api/clients/spliceAPI'
import type { Category, Transaction } from '../api/models'
import type { MRT_ColumnDef } from 'mantine-react-table'

const mockFns = vi.hoisted(() => ({
  useCategoryControllerFindAllMock: vi.fn(),
  useTransactionControllerUpdateCategoryMock: vi.fn(),
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
    useTransactionControllerUpdateCategory:
      mockFns.useTransactionControllerUpdateCategoryMock,
  }
})

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

beforeEach(() => {
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
    data: [providerCategory, overrideCategory, customCategory],
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
}): Transaction {
  return {
    id: 'txn-1',
    amount: {
      money: { amount: 1200, currency: 'USD' },
      sign: 'negative',
    },
    accountId: 'account-1',
    merchantName: 'Store',
    pending: false,
    externalTransactionId: 'external-1',
    logoUrl: null,
    date: '2026-02-14',
    datetime: null,
    authorizedDate: null,
    authorizedDatetime: null,
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
    createdAt: '2026-02-14T00:00:00.000Z',
    updatedAt: '2026-02-14T00:00:00.000Z',
    userId: 'user-1',
  }
}
