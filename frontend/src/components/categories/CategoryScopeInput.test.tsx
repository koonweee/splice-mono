import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CategoryScopeInput } from './CategoryScopeInput'
import type {
  AnalysisCategoryScope,
  CategoryManagementItem,
} from '../../api/models'

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

describe('CategoryScopeInput', () => {
  it('supports all mode, uncategorized selection, and clear all', () => {
    const onChange = vi.fn()

    renderInput({
      value: {
        mode: 'selected',
        categoryIds: [activeCategory.id],
        includeUncategorized: true,
      },
      onChange,
    })

    fireEvent.click(screen.getByRole('button', { name: /clear all/i }))

    expect(onChange).toHaveBeenCalledWith({
      mode: 'selected',
      categoryIds: [],
      includeUncategorized: false,
    })

    fireEvent.click(screen.getByLabelText(/include uncategorized/i))

    expect(onChange).toHaveBeenLastCalledWith({
      mode: 'selected',
      categoryIds: [activeCategory.id],
      includeUncategorized: false,
    })

    fireEvent.click(screen.getByText('All categories'))

    expect(onChange).toHaveBeenLastCalledWith({ mode: 'all' })
  })

  it('keeps archived category references searchable and removable', () => {
    const onChange = vi.fn()

    renderInput({
      value: {
        mode: 'selected',
        categoryIds: [archivedCategory.id],
        includeUncategorized: false,
      },
      onChange,
    })

    const categoryInput = screen
      .getAllByLabelText('Excluded categories categories')
      .find((element) => element.tagName === 'INPUT')

    expect(categoryInput).toBeTruthy()
    fireEvent.focus(categoryInput as HTMLElement)
    fireEvent.change(categoryInput as HTMLElement, {
      target: { value: 'grooming' },
    })

    expect(screen.getByText(/Grooming - Pets - Archived/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /clear all/i }))

    expect(onChange).toHaveBeenCalledWith({
      mode: 'selected',
      categoryIds: [],
      includeUncategorized: false,
    })
  })
})

function renderInput({
  value,
  onChange,
}: {
  value: AnalysisCategoryScope
  onChange: (value: AnalysisCategoryScope) => void
}) {
  return render(
    <MantineProvider>
      <CategoryScopeInput
        label="Excluded categories"
        value={value}
        onChange={onChange}
        categories={[activeCategory, archivedCategory]}
      />
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
