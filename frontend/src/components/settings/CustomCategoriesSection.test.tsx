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
  useCategoryControllerBulkUpdateCustomMock: vi.fn(),
  createMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
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
    useCategoryControllerBulkUpdateCustom:
      mockFns.useCategoryControllerBulkUpdateCustomMock,
  }
})

const activeCategory = makeCategory({
  id: 'active-category-id',
  primary: 'Home Projects',
  detailed: 'Hardware',
  transactionCount: 2,
})

const archivedCategory = makeCategory({
  id: 'archived-category-id',
  primary: 'Pets',
  detailed: 'Grooming',
  archivedAt: '2026-02-14T00:00:00.000Z',
})

beforeEach(() => {
  mockFns.useQueryClientMock.mockReturnValue({
    invalidateQueries: vi.fn(),
  })
  mockFns.useCategoryControllerFindManagementMock.mockImplementation(
    (params?: { archived?: boolean }) => ({
      data: params?.archived ? [archivedCategory] : [activeCategory],
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
  it('creates and edits user categories without system or visibility controls', () => {
    renderSection()

    expect(screen.queryByText('System')).toBeNull()
    expect(screen.queryByText(/visibility/i)).toBeNull()
    expect(screen.queryByText(/Hide from dropdowns/i)).toBeNull()

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
    fireEvent.change(screen.getByTestId('custom-category-color-input'), {
      target: { value: '#112233' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create category/i }))

    expect(mockFns.createMutateMock).toHaveBeenCalledWith({
      data: {
        primary: 'Kids',
        detailed: 'Activities',
        description: 'Weekend classes',
        color: '#112233',
      },
    })

    fireEvent.click(screen.getByLabelText('Close category panel'))
    fireEvent.click(screen.getByLabelText('View category details'))
    fireEvent.change(screen.getByTestId('custom-category-primary-input'), {
      target: { value: 'House' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(mockFns.updateMutateMock).toHaveBeenCalledWith({
      id: activeCategory.id,
      data: {
        primary: 'House',
        detailed: 'Hardware',
        description: '',
        color: activeCategory.color,
      },
    })
  })

  it('archives, restores, and bulk duplicates selected categories', () => {
    renderSection()

    expect(screen.getByRole('button', { name: /new category/i })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Select Home Projects > Hardware'))
    expect(screen.queryByRole('button', { name: /new category/i })).toBeNull()
    expect(screen.queryByLabelText('Bulk primary category')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))

    expect(mockFns.bulkCustomMutateMock).toHaveBeenCalledWith({
      data: {
        categoryIds: [activeCategory.id],
        action: 'archive',
      },
    })

    expect(screen.getByRole('button', { name: /^archive$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^restore$/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^duplicate$/i }))

    expect(mockFns.bulkCustomMutateMock).toHaveBeenLastCalledWith({
      data: {
        categoryIds: [activeCategory.id],
        action: 'duplicate',
      },
    })

    fireEvent.click(screen.getByRole('checkbox', { name: /archived/i }))
    fireEvent.click(screen.getByLabelText('Select Pets > Grooming'))
    expect(screen.getByRole('button', { name: /^restore$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^archive$/i })).toBeNull()

    fireEvent.click(screen.getByLabelText('Restore category'))

    expect(mockFns.bulkCustomMutateMock).toHaveBeenLastCalledWith({
      data: {
        categoryIds: [archivedCategory.id],
        action: 'restore',
      },
    })
  })

  it('renders categories as a mobile list on narrow screens', () => {
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

    expect(screen.getByLabelText('Categories list, 1 total')).toBeTruthy()
    expect(screen.queryByText('Used')).toBeNull()
    expect(screen.getByText('2 used')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Select Home Projects > Hardware'))
    fireEvent.click(screen.getByLabelText('Archive'))

    expect(mockFns.bulkCustomMutateMock).toHaveBeenCalledWith({
      data: {
        categoryIds: [activeCategory.id],
        action: 'archive',
      },
    })
  })

  it('clears selected rows after a successful bulk update', () => {
    mockFns.useCategoryControllerBulkUpdateCustomMock.mockImplementation(
      (options?: {
        mutation?: {
          onSuccess?: (result: {
            requested: number
            updated: number
            skipped: Array<never>
          }) => void
        }
      }) => ({
        mutate: (variables: unknown) => {
          mockFns.bulkCustomMutateMock(variables)
          options?.mutation?.onSuccess?.({
            requested: 1,
            updated: 1,
            skipped: [],
          })
        },
      }),
    )

    renderSection()

    fireEvent.click(screen.getByLabelText('Select Home Projects > Hardware'))
    expect(screen.queryByRole('button', { name: /new category/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))

    expect(screen.queryByText('1 selected')).toBeNull()
    expect(screen.getByRole('button', { name: /new category/i })).toBeTruthy()
  })

  it('offers restore for archived duplicate conflicts', () => {
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /new category/i }))
    fireEvent.change(screen.getByTestId('custom-category-primary-input'), {
      target: { value: 'Pets' },
    })
    fireEvent.change(screen.getByTestId('custom-category-detailed-input'), {
      target: { value: 'Grooming' },
    })

    expect(screen.getByText('Duplicate detected')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: /restore existing category/i }),
    )

    expect(mockFns.updateMutateMock).toHaveBeenCalledWith({
      id: archivedCategory.id,
      data: { archived: false },
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
    archivedAt: overrides.archivedAt ?? null,
    createdAt: overrides.createdAt ?? '2026-02-14T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-02-14T00:00:00.000Z',
    color: overrides.color ?? '#228be6',
    transactionCount: overrides.transactionCount ?? 0,
    lastUsedAt: overrides.lastUsedAt ?? null,
  }
}
