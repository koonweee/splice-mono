import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomCategoriesSection } from './CustomCategoriesSection'
import type * as ReactQuery from '@tanstack/react-query'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type { CategoryManagementItem } from '../../api/models'

const mockFns = vi.hoisted(() => ({
  useQueryClientMock: vi.fn(),
  useCategoryControllerFindManagementMock: vi.fn(),
  useCategoryControllerCreateCustomMock: vi.fn(),
  useCategoryControllerUpdateCustomMock: vi.fn(),
  useCategoryControllerBulkUpdateVisibilityMock: vi.fn(),
  useCategoryControllerBulkUpdateCustomMock: vi.fn(),
  createMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
  visibilityMutateMock: vi.fn(),
  bulkCustomMutateMock: vi.fn(),
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
    useCategoryControllerFindManagement:
      mockFns.useCategoryControllerFindManagementMock,
    useCategoryControllerCreateCustom:
      mockFns.useCategoryControllerCreateCustomMock,
    useCategoryControllerUpdateCustom:
      mockFns.useCategoryControllerUpdateCustomMock,
    useCategoryControllerBulkUpdateVisibility:
      mockFns.useCategoryControllerBulkUpdateVisibilityMock,
    useCategoryControllerBulkUpdateCustom:
      mockFns.useCategoryControllerBulkUpdateCustomMock,
  }
})

const systemCategory = makeCategory({
  id: 'system-category-id',
  primary: 'FOOD_AND_DRINK',
  detailed: 'FOOD_AND_DRINK_RESTAURANT',
  source: 'plaid',
  transactionCount: 4,
  lastUsedAt: '2026-02-14T00:00:00.000Z',
})

const hiddenSystemCategory = makeCategory({
  id: 'hidden-system-category-id',
  primary: 'TRANSPORTATION',
  detailed: 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES',
  source: 'plaid',
  isHidden: true,
})

const customCategory = makeCategory({
  id: 'custom-category-id',
  primary: 'Home Projects',
  detailed: 'Hardware',
  source: 'user',
  userId: 'user-1',
  transactionCount: 2,
})

const archivedCategory = makeCategory({
  id: 'archived-category-id',
  primary: 'Pets',
  detailed: 'Grooming',
  source: 'user',
  userId: 'user-1',
  archivedAt: '2026-02-14T00:00:00.000Z',
})

beforeEach(() => {
  mockFns.useQueryClientMock.mockReturnValue({
    invalidateQueries: vi.fn(),
  })
  mockFns.useCategoryControllerFindManagementMock.mockImplementation(
    (params?: { archived?: boolean }) => ({
      data: params?.archived
        ? [archivedCategory]
        : [systemCategory, hiddenSystemCategory, customCategory],
      isLoading: false,
      isError: false,
    }),
  )
  mockFns.useCategoryControllerCreateCustomMock.mockReturnValue({
    mutate: mockFns.createMutateMock,
    isPending: false,
    isError: false,
    error: null,
  })
  mockFns.useCategoryControllerUpdateCustomMock.mockReturnValue({
    mutate: mockFns.updateMutateMock,
    isPending: false,
    isError: false,
    error: null,
  })
  mockFns.useCategoryControllerBulkUpdateVisibilityMock.mockReturnValue({
    mutate: mockFns.visibilityMutateMock,
  })
  mockFns.useCategoryControllerBulkUpdateCustomMock.mockReturnValue({
    mutate: mockFns.bulkCustomMutateMock,
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

describe('CustomCategoriesSection', () => {
  it('creates a custom category without a visibility setting', () => {
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /new category/i }))
    fireEvent.change(screen.getByTestId('custom-category-primary-input'), {
      target: { value: 'Kids' },
    })
    fireEvent.change(screen.getByTestId('custom-category-detailed-input'), {
      target: { value: 'Activities' },
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Weekend classes' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create category/i }))

    expect(mockFns.createMutateMock).toHaveBeenCalledWith({
      data: {
        primary: 'Kids',
        detailed: 'Activities',
        description: 'Weekend classes',
      },
    })
  })

  it('blocks duplicate labels from hidden system and archived custom categories', () => {
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /new category/i }))
    fireEvent.change(screen.getByTestId('custom-category-primary-input'), {
      target: { value: ' transportation ' },
    })
    fireEvent.change(screen.getByTestId('custom-category-detailed-input'), {
      target: { value: ' taxis and ride shares ' },
    })

    expect(screen.getByText('Duplicate detected')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /create category/i }),
    ).toHaveProperty('disabled', true)

    fireEvent.change(screen.getByTestId('custom-category-primary-input'), {
      target: { value: 'Pets' },
    })
    fireEvent.change(screen.getByTestId('custom-category-detailed-input'), {
      target: { value: 'Grooming' },
    })

    expect(
      screen.getByRole('button', { name: /restore existing category/i }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /create category/i }),
    ).toHaveProperty('disabled', true)
    expect(mockFns.createMutateMock).not.toHaveBeenCalled()
  })

  it('shows hidden system categories and can show them again', () => {
    renderSection()

    expect(screen.getAllByText('Transportation').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Hidden').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByLabelText('Show in dropdowns'))

    expect(mockFns.visibilityMutateMock).toHaveBeenCalledWith({
      data: {
        categoryIds: [hiddenSystemCategory.id],
        hidden: false,
      },
    })
  })

  it('bulk hides selected active categories but disables custom-only actions', () => {
    renderSection()

    fireEvent.click(screen.getByLabelText('Select Food And Drink > Restaurant'))
    fireEvent.click(screen.getByLabelText('Select Home Projects > Hardware'))

    fireEvent.click(
      screen.getByText('Hide from dropdowns').closest('button') as HTMLElement,
    )

    expect(mockFns.visibilityMutateMock).toHaveBeenCalledWith({
      data: {
        categoryIds: [systemCategory.id, customCategory.id],
        hidden: true,
      },
    })
    expect(
      screen.getByRole('button', { name: /archive custom/i }),
    ).toHaveProperty('disabled', true)
  })

  it('shows inline details when a bulk action skips categories', () => {
    mockFns.useCategoryControllerBulkUpdateVisibilityMock.mockImplementation(
      (options?: {
        mutation?: {
          onSuccess?: (result: {
            requested: number
            updated: number
            skipped: Array<{ categoryId: string; reason: 'not_found' }>
          }) => void
        }
      }) => ({
        mutate: (variables: unknown) => {
          mockFns.visibilityMutateMock(variables)
          options?.mutation?.onSuccess?.({
            requested: 2,
            updated: 1,
            skipped: [
              { categoryId: hiddenSystemCategory.id, reason: 'not_found' },
            ],
          })
        },
      }),
    )

    renderSection()

    fireEvent.click(screen.getByLabelText('Select Food And Drink > Restaurant'))
    fireEvent.click(
      screen.getByLabelText('Select Transportation > Taxis And Ride Shares'),
    )
    fireEvent.click(
      screen.getByText('Hide from dropdowns').closest('button') as HTMLElement,
    )

    expect(screen.getByText('Some categories were skipped')).toBeTruthy()
    expect(
      screen.getByText(/Transportation > Taxis And Ride Shares: Not found/i),
    ).toBeTruthy()
  })

  it('requests archived-only rows and restores archived custom categories', () => {
    renderSection()

    fireEvent.click(screen.getByRole('checkbox', { name: /archived/i }))

    expect(mockFns.useCategoryControllerFindManagementMock).toHaveBeenCalledWith(
      { archived: true },
    )
    expect(screen.queryByText('Food And Drink')).toBeNull()
    expect(screen.getAllByText('Pets').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByLabelText('Restore category'))

    expect(mockFns.bulkCustomMutateMock).toHaveBeenCalledWith({
      data: {
        categoryIds: [archivedCategory.id],
        action: 'restore',
      },
    })
  })

  it('edits a custom category and leaves system rows read-only', () => {
    renderSection()

    fireEvent.click(screen.getAllByLabelText('View category details')[0])

    expect(screen.getByText('Food And Drink > Restaurant')).toBeTruthy()
    expect(
      screen.queryByTestId('custom-category-primary-input'),
    ).toBeNull()

    fireEvent.click(screen.getByLabelText('Close category panel'))
    fireEvent.click(screen.getAllByLabelText('View category details')[1])
    fireEvent.change(screen.getByTestId('custom-category-primary-input'), {
      target: { value: 'House' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(mockFns.updateMutateMock).toHaveBeenCalledWith({
      id: customCategory.id,
      data: {
        primary: 'House',
        detailed: 'Hardware',
        description: '',
      },
    })
  })
})

function renderSection() {
  return render(
    <MantineProvider>
      <CustomCategoriesSection />
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
    source: overrides.source,
    userId: overrides.userId,
    archivedAt: overrides.archivedAt ?? null,
    createdAt: overrides.createdAt ?? '2026-02-14T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-02-14T00:00:00.000Z',
    isHidden: overrides.isHidden ?? false,
    isSelectable: overrides.isSelectable ?? true,
    transactionCount: overrides.transactionCount ?? 0,
    lastUsedAt: overrides.lastUsedAt ?? null,
  }
}
