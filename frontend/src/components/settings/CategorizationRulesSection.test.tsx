import { MantineProvider } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CategorizationRulesSection } from './CategorizationRulesSection'
import type * as ReactQuery from '@tanstack/react-query'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type {
  Account,
  CategorizationRuleView,
  CategoryManagementItem,
} from '../../api/models'

const mockFns = vi.hoisted(() => ({
  useQueryClientMock: vi.fn(),
  useCategorizationRuleControllerFindAllMock: vi.fn(),
  useCategorizationRuleControllerPreviewApplicationMock: vi.fn(),
  useCategorizationRuleControllerCreateMock: vi.fn(),
  useCategorizationRuleControllerUpdateMock: vi.fn(),
  useCategorizationRuleControllerApplyMock: vi.fn(),
  useCategoryControllerFindManagementMock: vi.fn(),
  useAccountControllerFindAllMock: vi.fn(),
  createMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
  applyMutateMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual: typeof ReactQuery = await vi.importActual(
    '@tanstack/react-query',
  )

  return {
    ...actual,
    useQueryClient: mockFns.useQueryClientMock,
  }
})

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useAccountControllerFindAll: mockFns.useAccountControllerFindAllMock,
    useCategorizationRuleControllerApply:
      mockFns.useCategorizationRuleControllerApplyMock,
    useCategorizationRuleControllerCreate:
      mockFns.useCategorizationRuleControllerCreateMock,
    useCategorizationRuleControllerFindAll:
      mockFns.useCategorizationRuleControllerFindAllMock,
    useCategorizationRuleControllerPreviewApplication:
      mockFns.useCategorizationRuleControllerPreviewApplicationMock,
    useCategorizationRuleControllerUpdate:
      mockFns.useCategorizationRuleControllerUpdateMock,
    useCategoryControllerFindManagement:
      mockFns.useCategoryControllerFindManagementMock,
  }
})

const category = makeCategory({
  id: '00000000-0000-4000-8000-000000000100',
  primary: 'Transport',
  detailed: 'Rideshare',
})

const archivedRule: CategorizationRuleView = {
  id: '00000000-0000-4000-8000-000000000302',
  name: 'Old rideshare',
  priority: 20,
  targetCategoryId: category.id,
  targetCategory: category,
  conditions: [{ field: 'merchantName', operator: 'contains', value: 'lyft' }],
  archivedAt: '2026-02-15T00:00:00.000Z',
  createdAt: '2026-02-14T00:00:00.000Z',
  updatedAt: '2026-02-15T00:00:00.000Z',
}

const activeRule: CategorizationRuleView = {
  id: '00000000-0000-4000-8000-000000000301',
  name: 'Uber rideshare',
  priority: 10,
  targetCategoryId: category.id,
  targetCategory: category,
  conditions: [
    { field: 'merchantName', operator: 'contains', value: 'uber' },
    { field: 'amountSign', operator: 'equals', value: 'negative' },
  ],
  archivedAt: null,
  createdAt: '2026-02-14T00:00:00.000Z',
  updatedAt: '2026-02-14T00:00:00.000Z',
}

const account: Account = {
  id: '00000000-0000-4000-8000-000000000010',
  name: 'Checking',
  type: 'depository',
  subType: 'checking',
  availableBalance: {
    money: { amount: 10000, currency: 'USD' },
    sign: 'positive',
  },
  currentBalance: {
    money: { amount: 10000, currency: 'USD' },
    sign: 'positive',
  },
  createdAt: '2026-02-14T00:00:00.000Z',
  updatedAt: '2026-02-14T00:00:00.000Z',
  userId: 'user-1',
}

beforeEach(() => {
  mockFns.useQueryClientMock.mockReturnValue({
    invalidateQueries: mockFns.invalidateQueriesMock,
  })
  mockFns.useCategorizationRuleControllerFindAllMock.mockImplementation(
    (params?: { archived?: boolean }) => ({
      data: params?.archived ? [archivedRule] : [activeRule],
      isLoading: false,
      isError: false,
    }),
  )
  mockFns.useCategoryControllerFindManagementMock.mockImplementation(
    (params?: { archived?: boolean }) => ({
      data: params?.archived ? [] : [category],
      isLoading: false,
      isError: false,
    }),
  )
  mockFns.useAccountControllerFindAllMock.mockReturnValue({
    data: [account],
    isLoading: false,
    isError: false,
  })
  mockFns.useCategorizationRuleControllerCreateMock.mockReturnValue({
    mutate: mockFns.createMutateMock,
    isPending: false,
    isError: false,
    error: null,
  })
  mockFns.useCategorizationRuleControllerUpdateMock.mockReturnValue({
    mutate: mockFns.updateMutateMock,
    isPending: false,
    isError: false,
    error: null,
  })
  mockFns.useCategorizationRuleControllerApplyMock.mockReturnValue({
    mutate: mockFns.applyMutateMock,
    isPending: false,
    isError: false,
    error: null,
  })
  mockFns.useCategorizationRuleControllerPreviewApplicationMock.mockReturnValue({
    data: { matched: 24, updated: 18, skippedManual: 6 },
    isLoading: false,
    isError: false,
    error: null,
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

describe('CategorizationRulesSection', () => {
  it('renders active rules and archives them', () => {
    renderSection()

    expect(screen.getByText('Categorization rules')).toBeTruthy()
    expect(screen.getByText('Uber rideshare')).toBeTruthy()
    expect(screen.getByText('Transport / Rideshare')).toBeTruthy()
    expect(
      screen.getByText(/Merchant contains uber AND Amount is outflow/i),
    ).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Archive rule'))

    expect(mockFns.updateMutateMock).toHaveBeenCalledWith({
      id: activeRule.id,
      data: { archived: true },
    })
  })

  it('creates a rule with multiple AND conditions', async () => {
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /new rule/i }))
    const dialog = await screen.findByRole('dialog', {
      name: /new categorization rule/i,
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: /name/i }), {
      target: { value: 'Uber by amount' },
    })
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /target category/i }),
      { target: { value: 'Rideshare' } },
    )
    fireEvent.click(await screen.findByText('Rideshare'))
    fireEvent.change(
      within(dialog).getAllByRole('textbox', { name: /condition value/i })[0],
      {
        target: { value: 'UBER' },
      },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: /add condition/i }),
    )
    fireEvent.change(
      within(dialog).getAllByRole('textbox', { name: /condition value/i })[1],
      {
        target: { value: 'UBER TRIP' },
      },
    )

    expect(within(dialog).getByText('AND')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

    expect(mockFns.createMutateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Uber by amount',
        targetCategoryId: category.id,
        conditions: expect.arrayContaining([
          expect.objectContaining({
            field: 'merchantName',
            operator: 'contains',
          }),
        ]),
      }),
    })
  })

  it('applies a rule to existing transactions from the apply dialog', async () => {
    renderSection()

    fireEvent.click(
      screen.getByLabelText('Apply rule to existing transactions'),
    )
    const dialog = await screen.findByRole('dialog', {
      name: /apply rule to existing transactions/i,
    })

    expect(
      within(dialog).getByText('Manual categories are never overwritten.'),
    ).toBeTruthy()
    expect(
      mockFns.useCategorizationRuleControllerPreviewApplicationMock,
    ).toHaveBeenCalledWith(
      activeRule.id,
      expect.objectContaining({
        query: expect.objectContaining({ enabled: true }),
      }),
    )
    expect(within(dialog).getByText('24')).toBeTruthy()
    expect(within(dialog).getByText('18')).toBeTruthy()
    expect(within(dialog).getByText('6')).toBeTruthy()
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: /^apply to 18 transactions$/i,
      }),
    )

    expect(mockFns.applyMutateMock).toHaveBeenCalledWith({ id: activeRule.id })
  })

  it('shows archived rules and restores them', () => {
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /archived/i }))
    expect(screen.getByText('Old rideshare')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Restore rule'))

    expect(mockFns.updateMutateMock).toHaveBeenCalledWith({
      id: archivedRule.id,
      data: { archived: false },
    })
  })
})

function renderSection() {
  return render(
    <MantineProvider>
      <CategorizationRulesSection />
    </MantineProvider>,
  )
}

function makeCategory(
  overrides: Partial<CategoryManagementItem> &
    Pick<CategoryManagementItem, 'id' | 'primary' | 'detailed'>,
): CategoryManagementItem {
  return {
    id: overrides.id,
    primary: overrides.primary,
    detailed: overrides.detailed,
    description: overrides.description ?? '',
    color: overrides.color ?? '#7950f2',
    archivedAt: overrides.archivedAt ?? null,
    transactionCount: overrides.transactionCount ?? 0,
    lastUsedAt: overrides.lastUsedAt ?? null,
    createdAt: overrides.createdAt ?? '2026-02-14T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-02-14T00:00:00.000Z',
  }
}
