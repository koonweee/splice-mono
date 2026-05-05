import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomCategoriesSection } from './CustomCategoriesSection'
import type * as ReactQuery from '@tanstack/react-query'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type { Category } from '../../api/models'

const mockFns = vi.hoisted(() => ({
  useQueryClientMock: vi.fn(),
  useCategoryControllerFindAllMock: vi.fn(),
  useCategoryControllerFindCustomMock: vi.fn(),
  useCategoryControllerCreateCustomMock: vi.fn(),
  useCategoryControllerUpdateCustomMock: vi.fn(),
  createMutateMock: vi.fn(),
  updateMutateMock: vi.fn(),
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
    useCategoryControllerFindAll: mockFns.useCategoryControllerFindAllMock,
    useCategoryControllerFindCustom:
      mockFns.useCategoryControllerFindCustomMock,
    useCategoryControllerCreateCustom:
      mockFns.useCategoryControllerCreateCustomMock,
    useCategoryControllerUpdateCustom:
      mockFns.useCategoryControllerUpdateCustomMock,
  }
})

const plaidCategory = makeCategory({
  id: 'plaid-category-id',
  primary: 'FOOD_AND_DRINK',
  detailed: 'FOOD_AND_DRINK_RESTAURANT',
})
const customCategory = makeCategory({
  id: 'custom-category-id',
  primary: 'Home Projects',
  detailed: 'Hardware',
  source: 'user',
  userId: 'user-1',
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
  mockFns.useCategoryControllerFindAllMock.mockReturnValue({
    data: [plaidCategory, customCategory],
  })
  mockFns.useCategoryControllerFindCustomMock.mockReturnValue({
    data: [customCategory],
    isLoading: false,
    isError: false,
  })
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
    variables: undefined,
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
  it('blocks duplicate normalized category pairs before submit', () => {
    renderSection()

    fireEvent.change(screen.getByTestId('custom-category-primary-input'), {
      target: { value: ' food   and drink ' },
    })
    fireEvent.change(screen.getByTestId('custom-category-detailed-input'), {
      target: { value: ' restaurant ' },
    })

    expect(screen.getByText('Food And Drink > Restaurant')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /create category/i }),
    ).toHaveProperty('disabled', true)
  })

  it('creates a unique custom category', () => {
    renderSection()

    fireEvent.change(screen.getByTestId('custom-category-primary-input'), {
      target: { value: 'Kids' },
    })
    fireEvent.change(screen.getByTestId('custom-category-detailed-input'), {
      target: { value: 'Activities' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create category/i }))

    expect(mockFns.createMutateMock).toHaveBeenCalledWith({
      data: {
        primary: 'Kids',
        detailed: 'Activities',
      },
    })
  })

  it('lists custom categories with user badges and archive action', () => {
    renderSection()

    expect(screen.getAllByText('Home Projects').length).toBeGreaterThan(0)
    expect(screen.getAllByText('User').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByLabelText('Archive category'))

    expect(mockFns.updateMutateMock).toHaveBeenCalledWith({
      id: customCategory.id,
      data: { archived: true },
    })
  })

  it('requests archived categories and restores them when shown', () => {
    mockFns.useCategoryControllerFindCustomMock.mockReturnValue({
      data: [customCategory, archivedCategory],
      isLoading: false,
      isError: false,
    })

    renderSection()

    fireEvent.click(screen.getByRole('checkbox', { name: /show archived/i }))

    expect(mockFns.useCategoryControllerFindCustomMock).toHaveBeenCalledWith({
      includeArchived: true,
    })

    fireEvent.click(screen.getByLabelText('Restore category'))

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
  overrides: Pick<Category, 'id' | 'primary' | 'detailed'> & Partial<Category>,
): Category {
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
  }
}
