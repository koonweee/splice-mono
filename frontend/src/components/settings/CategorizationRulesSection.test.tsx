import { MantineProvider } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDateTime } from '../../lib/format'
import { CategorizationRulesSection } from './CategorizationRulesSection'
import type * as ReactQuery from '@tanstack/react-query'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type {
  Account,
  CategorizationRuleSuggestion,
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
  useCategorizationRuleRecommendationControllerAcceptMock: vi.fn(),
  useCategorizationRuleRecommendationControllerDismissMock: vi.fn(),
  useCategorizationRuleRecommendationControllerGenerateMock: vi.fn(),
  useCategorizationRuleRecommendationControllerListMock: vi.fn(),
  useCategorizationRuleRecommendationControllerRegenerateMock: vi.fn(),
  useCategoryControllerFindManagementMock: vi.fn(),
  useAccountControllerFindAllMock: vi.fn(),
  createMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
  applyMutateMock: vi.fn(),
  acceptRecommendationMutateMock: vi.fn(),
  dismissRecommendationMutateMock: vi.fn(),
  generateRecommendationsMutateMock: vi.fn(),
  regenerateRecommendationsMutateMock: vi.fn(),
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
    useCategorizationRuleRecommendationControllerAccept:
      mockFns.useCategorizationRuleRecommendationControllerAcceptMock,
    useCategorizationRuleRecommendationControllerDismiss:
      mockFns.useCategorizationRuleRecommendationControllerDismissMock,
    useCategorizationRuleRecommendationControllerGenerate:
      mockFns.useCategorizationRuleRecommendationControllerGenerateMock,
    useCategorizationRuleRecommendationControllerList:
      mockFns.useCategorizationRuleRecommendationControllerListMock,
    useCategorizationRuleRecommendationControllerRegenerate:
      mockFns.useCategorizationRuleRecommendationControllerRegenerateMock,
    useCategoryControllerFindManagement:
      mockFns.useCategoryControllerFindManagementMock,
  }
})

const category = makeCategory({
  id: '00000000-0000-4000-8000-000000000100',
  primary: 'Transport',
  detailed: 'Rideshare',
})

const historicalCategory = makeCategory({
  id: '00000000-0000-4000-8000-000000000101',
  primary: 'Others',
  detailed: 'Pre 2026',
})

const archivedRule: CategorizationRuleView = {
  revision: 2,
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
  revision: 1,
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

const suggestion: CategorizationRuleSuggestion = {
  id: '00000000-0000-4000-8000-000000000401',
  userId: 'user-1',
  generationId: '00000000-0000-4000-8000-000000000501',
  name: 'Suggested Uber rideshare',
  priority: 10,
  targetCategoryId: category.id,
  targetCategory: category,
  conditions: [{ field: 'merchantName', operator: 'contains', value: 'uber' }],
  rationale: 'Several manually categorized transactions mention Uber.',
  status: 'pending',
  acceptedRuleId: null,
  matched: 8,
  updated: 6,
  skippedManual: 2,
  manualAgreement: 6,
  manualConflicts: 0,
  existingRuleOverlap: 0,
  previewTransactions: [],
  generatedBy: 'mastra',
  model: 'gpt-5.4-mini',
  createdAt: '2026-02-14T00:00:00.000Z',
  updatedAt: '2026-02-14T00:00:00.000Z',
}

const account: Account = {
  id: '00000000-0000-4000-8000-000000000010',
  name: 'Checking',
  type: 'depository',
  valuationMode: 'balance',
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
      data: params?.archived ? [] : [category, historicalCategory],
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
  mockFns.useCategorizationRuleRecommendationControllerListMock.mockReturnValue(
    {
      data: { generation: null, suggestions: [] },
      isLoading: false,
      isError: false,
      error: null,
    },
  )
  mockFns.useCategorizationRuleRecommendationControllerGenerateMock.mockReturnValue(
    {
      mutate: mockFns.generateRecommendationsMutateMock,
      isPending: false,
      isError: false,
      error: null,
    },
  )
  mockFns.useCategorizationRuleRecommendationControllerRegenerateMock.mockReturnValue(
    {
      mutate: mockFns.regenerateRecommendationsMutateMock,
      isPending: false,
      isError: false,
      error: null,
    },
  )
  mockFns.useCategorizationRuleRecommendationControllerAcceptMock.mockReturnValue(
    {
      mutate: mockFns.acceptRecommendationMutateMock,
      isPending: false,
      isError: false,
      error: null,
    },
  )
  mockFns.useCategorizationRuleRecommendationControllerDismissMock.mockReturnValue(
    {
      mutate: mockFns.dismissRecommendationMutateMock,
      isPending: false,
      isError: false,
      error: null,
    },
  )
  mockFns.useCategorizationRuleControllerPreviewApplicationMock.mockReturnValue(
    {
      data: { matched: 24, updated: 18, skippedManual: 6, transactions: [] },
      isLoading: false,
      isError: false,
      error: null,
    },
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

describe('CategorizationRulesSection', () => {
  it('keeps cached rows visible after a refresh failure and wires Retry', () => {
    const refetch = vi.fn()
    mockFns.useCategorizationRuleControllerFindAllMock.mockReturnValue({
      data: [activeRule],
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    })
    renderSection()
    expect(screen.getAllByText(activeRule.name).length).toBeGreaterThan(0)
    expect(
      screen.getByText('Previously loaded results are shown below.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('renders active rules and archives them', () => {
    renderSection()

    expect(screen.getByText('Categorization rules')).toBeTruthy()
    expect(screen.getByText('Uber rideshare')).toBeTruthy()
    expect(screen.getByText('Transport / Rideshare')).toBeTruthy()
    expect(
      screen.getByText(/Merchant contains uber and Money is going out/i),
    ).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Archive rule'))

    expect(mockFns.updateMutateMock).toHaveBeenCalledWith({
      id: activeRule.id,
      data: { archived: true },
    })
  })

  it('shows readable bank categories and account names without changing saved conditions', async () => {
    const rule: CategorizationRuleView = {
      ...activeRule,
      conditions: [
        {
          field: 'providerCategoryDetailed',
          operator: 'equals',
          value: 'income_wages',
        },
        { field: 'accountId', operator: 'equals', value: account.id },
      ],
    }
    mockFns.useCategorizationRuleControllerFindAllMock.mockReturnValue({
      data: [rule],
      isLoading: false,
      isError: false,
    })
    renderSection()

    expect(
      screen.getByText(
        /Bank subcategory is Income Wages and Account is Checking/,
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Edit rule'))
    const editor = await screen.findByRole('dialog', {
      name: 'Edit categorization rule',
    })
    fireEvent.click(within(editor).getByRole('button', { name: /^save$/i }))
    expect(mockFns.updateMutateMock).toHaveBeenCalledWith({
      id: rule.id,
      data: expect.objectContaining({ conditions: rule.conditions }),
    })
  })

  it('creates a rule with multiple AND conditions', async () => {
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /add rule/i }))
    const dialog = await screen.findByRole('dialog', {
      name: /add categorization rule/i,
    })
    const form = dialog.querySelector('form')
    if (!form) throw new Error('Categorization rule editor form is missing')
    fireEvent.submit(form)
    expect(mockFns.createMutateMock).not.toHaveBeenCalled()
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
    expect(
      within(dialog)
        .getByRole('textbox', { name: /^priority/i })
        .hasAttribute('required'),
    ).toBe(true)
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

    fireEvent.click(screen.getByRole('checkbox', { name: /archived/i }))
    expect(screen.getByText('Old rideshare')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Restore rule'))

    expect(mockFns.updateMutateMock).toHaveBeenCalledWith({
      id: archivedRule.id,
      data: { archived: false },
    })
  })

  it('does not start recommendation generation before recommendations load', () => {
    mockFns.useCategorizationRuleRecommendationControllerListMock.mockReturnValue(
      {
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      },
    )

    renderSection()
    fireEvent.click(screen.getByLabelText('Rule recommendations'))

    expect(mockFns.generateRecommendationsMutateMock).not.toHaveBeenCalled()
  })

  it('opens recommendations without auto-generating when none exist', async () => {
    renderSection()

    fireEvent.click(screen.getByLabelText('Rule recommendations'))

    expect(mockFns.generateRecommendationsMutateMock).not.toHaveBeenCalled()
    expect(await screen.findByText('No recommendations yet')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: /^generate recommendations$/i }),
    )

    expect(mockFns.generateRecommendationsMutateMock).toHaveBeenCalledWith({
      data: { ignoredCategoryIds: [historicalCategory.id] },
    })
  })

  it('shows last completed run and requires explicit regeneration', async () => {
    mockFns.useCategorizationRuleRecommendationControllerListMock.mockReturnValue(
      {
        data: {
          generation: {
            id: '00000000-0000-4000-8000-000000000501',
            userId: 'user-1',
            status: 'completed',
            model: 'gpt-5.4-mini',
            ignoredCategoryIds: [historicalCategory.id],
            startedAt: '2026-02-14T00:00:00.000Z',
            completedAt: '2026-02-14T00:01:00.000Z',
            failedAt: null,
            errorMessage: null,
            createdAt: '2026-02-14T00:00:00.000Z',
            updatedAt: '2026-02-14T00:01:00.000Z',
          },
          suggestions: [],
        },
        isLoading: false,
        isError: false,
        error: null,
      },
    )

    renderSection()
    fireEvent.click(screen.getByLabelText('Rule recommendations'))

    expect(
      await screen.findByText(
        `Last run ${formatDateTime('2026-02-14T00:01:00.000Z')}.`,
      ),
    ).toBeTruthy()
    expect(screen.getByText('No recommendations found')).toBeTruthy()
    expect(mockFns.generateRecommendationsMutateMock).not.toHaveBeenCalled()
    expect(mockFns.regenerateRecommendationsMutateMock).not.toHaveBeenCalled()

    const regenerateButtons = screen.getAllByRole('button', {
      name: /^regenerate recommendations$/i,
    })
    expect(regenerateButtons).toHaveLength(2)
    fireEvent.click(regenerateButtons[1])

    expect(mockFns.regenerateRecommendationsMutateMock).toHaveBeenCalledWith({
      data: { ignoredCategoryIds: [historicalCategory.id] },
    })
  })

  it('polls recommendations only while generation is running', () => {
    renderSection()
    fireEvent.click(screen.getByLabelText('Rule recommendations'))

    const latestCall =
      mockFns.useCategorizationRuleRecommendationControllerListMock.mock.calls.at(
        -1,
      )
    expect(latestCall).toBeDefined()
    const options = latestCall?.[0] as {
      query: {
        refetchInterval: (query: {
          state: {
            data: {
              generation: { status: string } | null
              suggestions: Array<unknown>
            }
          }
        }) => number | false
      }
    }
    const refetchInterval = options.query.refetchInterval

    expect(
      refetchInterval({
        state: {
          data: {
            generation: { status: 'processing' },
            suggestions: [],
          },
        },
      }),
    ).toBe(3000)
    expect(
      refetchInterval({
        state: {
          data: {
            generation: { status: 'completed' },
            suggestions: [],
          },
        },
      }),
    ).toBe(false)
  })

  it('shows pending recommendations without triggering generation', async () => {
    mockFns.useCategorizationRuleRecommendationControllerListMock.mockReturnValue(
      {
        data: { generation: null, suggestions: [suggestion] },
        isLoading: false,
        isError: false,
        error: null,
      },
    )

    renderSection()
    fireEvent.click(screen.getByLabelText('Rule recommendations'))

    expect(mockFns.generateRecommendationsMutateMock).not.toHaveBeenCalled()
    expect(await screen.findByText('Suggested Uber rideshare')).toBeTruthy()
    expect(
      screen.getByText(
        'Several manually categorized transactions mention Uber.',
      ),
    ).toBeTruthy()

    fireEvent.click(
      screen.getByLabelText('Accept recommendation Suggested Uber rideshare'),
    )
    expect(mockFns.acceptRecommendationMutateMock).toHaveBeenCalledWith({
      id: suggestion.id,
    })

    fireEvent.click(
      screen.getByLabelText('Dismiss recommendation Suggested Uber rideshare'),
    )
    expect(mockFns.dismissRecommendationMutateMock).toHaveBeenCalledWith({
      id: suggestion.id,
    })
  })

  it('shows persisted generation progress copy', async () => {
    mockFns.useCategorizationRuleRecommendationControllerListMock.mockReturnValue(
      {
        data: {
          generation: {
            id: '00000000-0000-4000-8000-000000000501',
            userId: 'user-1',
            status: 'processing',
            model: 'gpt-5.4-mini',
            ignoredCategoryIds: [historicalCategory.id],
            startedAt: '2026-02-14T00:00:00.000Z',
            completedAt: null,
            failedAt: null,
            errorMessage: null,
            createdAt: '2026-02-14T00:00:00.000Z',
            updatedAt: '2026-02-14T00:00:00.000Z',
          },
          suggestions: [],
        },
        isLoading: false,
        isError: false,
        error: null,
      },
    )

    renderSection()
    fireEvent.click(screen.getByLabelText('Rule recommendations'))

    expect(
      await screen.findByText('You can close this panel and come back later.'),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'This may take a moment. You can leave and return later.',
      ),
    ).toBeTruthy()
  })

  it('previews a recommendation using rule-like surfaces', async () => {
    mockFns.useCategorizationRuleRecommendationControllerListMock.mockReturnValue(
      {
        data: { generation: null, suggestions: [suggestion] },
        isLoading: false,
        isError: false,
        error: null,
      },
    )

    renderSection()
    fireEvent.click(screen.getByLabelText('Rule recommendations'))
    fireEvent.click(
      await screen.findByLabelText(
        'Preview recommendation Suggested Uber rideshare',
      ),
    )

    const previewDialog = await screen.findByRole('dialog', {
      name: /preview recommendation: suggested uber rideshare/i,
    })
    expect(within(previewDialog).getByText('Matched')).toBeTruthy()
    expect(within(previewDialog).getByText('Would update')).toBeTruthy()
    expect(
      within(previewDialog).getByText(
        'Manual categories are never overwritten.',
      ),
    ).toBeTruthy()

    fireEvent.click(
      within(previewDialog).getByRole('button', { name: /^close$/i }),
    )
  })

  it('opens a recommendation in the rule editor', async () => {
    mockFns.useCategorizationRuleRecommendationControllerListMock.mockReturnValue(
      {
        data: { generation: null, suggestions: [suggestion] },
        isLoading: false,
        isError: false,
        error: null,
      },
    )

    renderSection()
    fireEvent.click(screen.getByLabelText('Rule recommendations'))
    await screen.findByText('Suggested Uber rideshare')

    fireEvent.click(
      screen.getByLabelText('Edit recommendation Suggested Uber rideshare'),
    )

    const editDialog = await screen.findByRole('dialog', {
      name: /add categorization rule/i,
    })
    expect(
      within(editDialog).getByDisplayValue('Suggested Uber rideshare'),
    ).toBeTruthy()
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
