import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionSource } from '../api/models'
import { CategoryTransactionsModal } from './CategoryTransactionsModal'
import type React from 'react'
import type * as Mantine from '@mantine/core'
import type * as SpliceAPI from '../api/clients/spliceAPI'
import type { Transaction } from '../api/models'

type AnalysisHookState = {
  data?: Array<Transaction>
  isPending: boolean
}

const mockFns = vi.hoisted(() => ({
  useTransactionAnalysisControllerGetTransactionsMock: vi.fn(),
  transactionsTableMock: vi.fn(),
  transactionsMobileListMock: vi.fn(),
  isMobile: false,
}))

vi.mock('@mantine/core', async () => {
  const actual: typeof Mantine = await vi.importActual('@mantine/core')

  return {
    ...actual,
    Loader: () => <div data-testid="category-transactions-loader" />,
  }
})

vi.mock('../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useTransactionAnalysisControllerGetTransactions:
      mockFns.useTransactionAnalysisControllerGetTransactionsMock,
  }
})

vi.mock('../lib/hooks', () => ({
  useIsMobile: () => mockFns.isMobile,
}))

vi.mock('./TransactionsTable', () => ({
  TransactionsTable: (props: unknown) => {
    mockFns.transactionsTableMock(props)

    return <div data-testid="transactions-table" />
  },
}))

vi.mock('./transactions/TransactionsMobileList', () => ({
  TransactionsMobileList: (props: unknown) => {
    mockFns.transactionsMobileListMock(props)

    return <div data-testid="transactions-mobile-list" />
  },
}))

let analysisHookState: AnalysisHookState

function makeTransaction(
  overrides: Partial<Transaction> & Pick<Transaction, 'id'>,
): Transaction {
  return {
    id: overrides.id,
    source: overrides.source ?? TransactionSource.provider,
    amount: overrides.amount ?? {
      money: {
        amount: 1250,
        currency: 'USD',
      },
      sign: 'negative',
    },
    accountId: overrides.accountId ?? 'acct-1',
    merchantName: overrides.merchantName ?? 'Coffee Shop',
    providerTransactionName: overrides.providerTransactionName ?? null,
    originalDescription: overrides.originalDescription ?? null,
    pending: overrides.pending ?? false,
    pendingTransactionId: overrides.pendingTransactionId ?? null,
    accountOwner: overrides.accountOwner ?? null,
    externalTransactionId: overrides.externalTransactionId ?? null,
    logoUrl: overrides.logoUrl ?? null,
    website: overrides.website ?? null,
    merchantEntityId: overrides.merchantEntityId ?? null,
    paymentChannel: overrides.paymentChannel ?? null,
    transactionCode: overrides.transactionCode ?? null,
    counterparties: overrides.counterparties ?? null,
    location: overrides.location ?? null,
    paymentMeta: overrides.paymentMeta ?? null,
    activityDate: overrides.activityDate ?? '2026-02-14',
    reportingDateOverride: overrides.reportingDateOverride ?? null,
    providerDate: overrides.providerDate ?? '2026-02-14',
    providerDatetime: overrides.providerDatetime ?? null,
    authorizedDate: overrides.authorizedDate ?? null,
    authorizedDatetime: overrides.authorizedDatetime ?? null,
    categoryId: overrides.categoryId ?? null,
    category: overrides.category,
    categoryUpdatedAt: overrides.categoryUpdatedAt ?? null,
    categoryAssignmentSource: overrides.categoryAssignmentSource ?? null,
    categoryAssignmentRuleId: overrides.categoryAssignmentRuleId ?? null,
    providerCategoryHint: overrides.providerCategoryHint ?? null,
    accountName: overrides.accountName ?? 'Checking',
    convertedAmount: overrides.convertedAmount,
    createdAt: overrides.createdAt ?? '2026-02-14T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-02-14T00:00:00.000Z',
    userId: overrides.userId ?? 'user-1',
  }
}

function renderModal(
  props: Partial<React.ComponentProps<typeof CategoryTransactionsModal>> = {},
) {
  return render(
    <MantineProvider>
      <CategoryTransactionsModal
        opened
        onClose={() => {}}
        categoryPrimary="UNCATEGORIZED"
        startDate="2026-02-01"
        endDate="2026-02-28"
        flowDirection="outflow"
        {...props}
      />
    </MantineProvider>,
  )
}

beforeEach(() => {
  analysisHookState = {
    data: [],
    isPending: false,
  }
  mockFns.isMobile = false

  mockFns.useTransactionAnalysisControllerGetTransactionsMock.mockImplementation(
    () => analysisHookState,
  )

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

describe('CategoryTransactionsModal', () => {
  it('requests unmatched drilldown rows with the selected filters and keeps the empty state title', () => {
    renderModal()

    expect(
      mockFns.useTransactionAnalysisControllerGetTransactionsMock,
    ).toHaveBeenCalledWith(
      {
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        categoryPrimary: 'UNCATEGORIZED',
        flowDirection: 'outflow',
      },
      { query: { enabled: true } },
    )

    expect(
      screen.getByText('Uncategorized Transactions (Outflows)'),
    ).toBeTruthy()
    expect(screen.getByText('No transactions found.')).toBeTruthy()
  })

  it('shows the existing loading state while the transaction drilldown is pending', () => {
    analysisHookState.isPending = true

    renderModal()

    expect(
      mockFns.useTransactionAnalysisControllerGetTransactionsMock,
    ).toHaveBeenCalled()
    expect(screen.getByTestId('category-transactions-loader')).toBeTruthy()
    expect(screen.queryByText('No transactions found.')).toBeNull()
  })

  it('renders TransactionsTable from the direct transaction array response', () => {
    const transaction = makeTransaction({ id: 'txn-1' })
    analysisHookState.data = [transaction]

    renderModal()

    expect(screen.getByTestId('transactions-table')).toBeTruthy()
    expect(mockFns.transactionsTableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [transaction],
        totalRows: 1,
        isLoading: false,
        isError: false,
        mantinePaperProps: expect.objectContaining({
          className: expect.any(String),
        }),
        mantineTableContainerProps: expect.objectContaining({
          className: expect.any(String),
        }),
      }),
    )
    expect(screen.queryByText('No transactions found.')).toBeNull()
  })

  it('renders the shared mobile transaction list for transaction drilldowns on mobile', () => {
    const transaction = makeTransaction({ id: 'txn-1' })
    analysisHookState.data = [transaction]
    mockFns.isMobile = true

    renderModal()

    expect(screen.getByTestId('transactions-mobile-list')).toBeTruthy()
    expect(mockFns.transactionsMobileListMock).toHaveBeenCalledWith({
      data: [transaction],
      totalRows: 1,
      isLoading: false,
      isError: false,
      variant: 'drilldown',
    })
    expect(mockFns.transactionsTableMock).not.toHaveBeenCalled()
  })
})
