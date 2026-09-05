import { MantineProvider } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalysisRulesSection } from './AnalysisRulesSection'
import type { ComponentProps } from 'react'
import type * as ReactQuery from '@tanstack/react-query'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type { CategoryManagementItem } from '../../api/models'

const mockFns = vi.hoisted(() => ({
  useQueryClientMock: vi.fn(),
  useAnalysisRuleControllerFindAllMock: vi.fn(),
  useAnalysisRuleControllerCreateMock: vi.fn(),
  useAnalysisRuleControllerUpdateMock: vi.fn(),
  useCategoryControllerFindManagementMock: vi.fn(),
  createMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
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
    useAnalysisRuleControllerFindAll:
      mockFns.useAnalysisRuleControllerFindAllMock,
    useAnalysisRuleControllerCreate:
      mockFns.useAnalysisRuleControllerCreateMock,
    useAnalysisRuleControllerUpdate:
      mockFns.useAnalysisRuleControllerUpdateMock,
    useCategoryControllerFindManagement:
      mockFns.useCategoryControllerFindManagementMock,
  }
})

const activeCategory = makeCategory({
  id: 'active-category-id',
  primary: 'Home Projects',
  detailed: 'Hardware',
})

const archivedCategory = makeCategory({
  id: 'archived-category-id',
  primary: 'Pets',
  detailed: 'Grooming',
  archivedAt: '2026-02-14T00:00:00.000Z',
})

const activeRule = {
  id: 'active-rule-id',
  name: 'Cancel reimbursements',
  type: 'neutralize',
  excludeScope: null,
  inflowScope: {
    mode: 'selected',
    includeUncategorized: false,
    categories: [activeCategory],
  },
  outflowScope: { mode: 'all' },
  archivedAt: null,
  createdAt: '2026-02-14T00:00:00.000Z',
  updatedAt: '2026-02-14T00:00:00.000Z',
} as const

const archivedRule = {
  id: 'archived-rule-id',
  name: 'Ignore pets',
  type: 'exclude',
  excludeScope: {
    mode: 'selected',
    includeUncategorized: false,
    categories: [archivedCategory],
  },
  inflowScope: null,
  outflowScope: null,
  archivedAt: '2026-02-15T00:00:00.000Z',
  createdAt: '2026-02-14T00:00:00.000Z',
  updatedAt: '2026-02-15T00:00:00.000Z',
} as const

beforeEach(() => {
  mockFns.useQueryClientMock.mockReturnValue({
    invalidateQueries: mockFns.invalidateQueriesMock,
  })
  mockFns.useAnalysisRuleControllerFindAllMock.mockImplementation(
    (params?: { archived?: boolean }) => ({
      data: params?.archived ? [archivedRule] : [activeRule],
      isLoading: false,
      isError: false,
    }),
  )
  mockFns.useCategoryControllerFindManagementMock.mockImplementation(
    (params?: { archived?: boolean }) => ({
      data: params?.archived ? [archivedCategory] : [activeCategory],
      isLoading: false,
      isError: false,
    }),
  )
  mockFns.useAnalysisRuleControllerCreateMock.mockReturnValue({
    mutate: mockFns.createMutateMock,
    isPending: false,
    isError: false,
    error: null,
  })
  mockFns.useAnalysisRuleControllerUpdateMock.mockReturnValue({
    mutate: mockFns.updateMutateMock,
    isPending: false,
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
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('AnalysisRulesSection', () => {
  it('keeps cached rows visible after a refresh failure and wires Retry', () => {
    const refetch = vi.fn()
    mockFns.useAnalysisRuleControllerFindAllMock.mockReturnValue({
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

  it('renders rules and archives active rules', () => {
    renderSection()

    expect(screen.getByText('Matching window')).toBeTruthy()
    expect(
      screen.getAllByText(
        'Match up to 60 days before or after the selected date range.',
      ),
    ).not.toHaveLength(0)
    expect(screen.getByText('Cancel reimbursements')).toBeTruthy()
    expect(
      screen.getAllByText(
        /When money in for Hardware \(Home Projects\) matches money out for All categories, exclude both from analysis\./,
      ),
    ).not.toHaveLength(0)

    fireEvent.click(screen.getByLabelText('Archive rule'))

    expect(mockFns.updateMutateMock).toHaveBeenCalledWith({
      id: activeRule.id,
      data: { archived: true },
    })
  })

  it('renders rules as a mobile list on narrow screens', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation(() => ({
        matches: true,
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

    renderSection()

    expect(screen.getByLabelText('Analysis rules list, 2 total')).toBeTruthy()
    expect(screen.queryByText('Actions')).toBeNull()

    fireEvent.click(screen.getByLabelText('Archive rule'))

    expect(mockFns.updateMutateMock).toHaveBeenCalledWith({
      id: activeRule.id,
      data: { archived: true },
    })
  })

  it('creates an exclude rule with an all-categories scope', async () => {
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /add rule/i }))
    const editor = await screen.findByRole('dialog', {
      name: 'Add analysis rule',
    })
    const form = editor.querySelector('form')
    if (!form) throw new Error('Analysis rule editor form is missing')
    fireEvent.submit(form)
    expect(mockFns.createMutateMock).not.toHaveBeenCalled()
    fireEvent.change(await screen.findByRole('textbox', { name: /name/i }), {
      target: { value: 'Ignore everything' },
    })
    fireEvent.click(screen.getByText('All categories'))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(mockFns.createMutateMock).toHaveBeenCalledWith({
      data: {
        name: 'Ignore everything',
        type: 'exclude',
        excludeScope: { mode: 'all' },
      },
    })
  })

  it('hides the lookaround setting in archived mode', () => {
    renderSection()

    fireEvent.click(screen.getByRole('checkbox', { name: /archived/i }))

    expect(screen.queryByText('Matching window')).toBeNull()
    expect(screen.getByText('Ignore pets')).toBeTruthy()
  })

  it('saves lookaround days through the connector seam', async () => {
    const onSave = vi.fn()

    renderSection({ lookaroundSetting: { value: 45, onSave } })

    fireEvent.click(screen.getByLabelText('Edit matching window'))
    const dialog = await screen.findByRole('dialog', {
      name: /edit matching window/i,
    })
    fireEvent.change(
      within(dialog).getByRole('textbox', {
        name: /days outside the date range/i,
      }),
      {
        target: { value: '30' },
      },
    )
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

    expect(onSave).toHaveBeenCalledWith(30)
    await waitFor(() => {
      expect(mockFns.invalidateQueriesMock).toHaveBeenCalled()
    })
  })

  it('does not treat a blank matching window as zero when the form is submitted', async () => {
    const onSave = vi.fn()
    renderSection({ lookaroundSetting: { value: 45, onSave } })
    fireEvent.click(screen.getByLabelText('Edit matching window'))
    const editor = await screen.findByRole('dialog', {
      name: 'Edit matching window',
    })
    fireEvent.change(
      within(editor).getByRole('textbox', {
        name: /days outside the date range/i,
      }),
      {
        target: { value: '' },
      },
    )
    const form = editor.querySelector('form')
    if (!form) throw new Error('Matching window form is missing')
    fireEvent.submit(form)
    expect(onSave).not.toHaveBeenCalled()
    expect(
      within(editor).getByText('Enter a whole number from 0 to 180.'),
    ).toBeTruthy()
  })

  it('shows a readable error when the matching window setting is unavailable', async () => {
    renderSection()

    fireEvent.click(screen.getByLabelText('Edit matching window'))
    const dialog = await screen.findByRole('dialog', {
      name: /edit matching window/i,
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }))

    expect(
      await screen.findByText(/matching window setting is unavailable/i),
    ).toBeTruthy()
  })

  it('restores archived duplicate conflicts from the editor', async () => {
    mockFns.useAnalysisRuleControllerCreateMock.mockReturnValue({
      mutate: mockFns.createMutateMock,
      isPending: false,
      isError: true,
      error: {
        response: {
          data: {
            rule: {
              ruleId: archivedRule.id,
              name: archivedRule.name,
              type: archivedRule.type,
              label: 'Exclude Grooming',
              archivedAt: archivedRule.archivedAt,
            },
          },
        },
      },
    })

    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /add rule/i }))
    expect(await screen.findByText('Duplicate detected')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: /restore existing rule/i }),
    )

    expect(mockFns.updateMutateMock).toHaveBeenCalledWith({
      id: archivedRule.id,
      data: { archived: false },
    })
  })
})

function renderSection(
  props: Partial<ComponentProps<typeof AnalysisRulesSection>> = {},
) {
  return render(
    <MantineProvider>
      <AnalysisRulesSection {...props} />
    </MantineProvider>,
  )
}

function makeCategory(
  overrides: Pick<CategoryManagementItem, 'id' | 'primary' | 'detailed'> &
    Partial<CategoryManagementItem>,
): CategoryManagementItem {
  return {
    id: overrides.id,
    primary: overrides.primary,
    detailed: overrides.detailed,
    description: overrides.description ?? '',
    archivedAt: overrides.archivedAt ?? null,
    createdAt: overrides.createdAt ?? '2026-02-14T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-02-14T00:00:00.000Z',
    color: overrides.color ?? '#228be6',
    transactionCount: overrides.transactionCount ?? 0,
    lastUsedAt: overrides.lastUsedAt ?? null,
  }
}
