import {
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  MultiSelect,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core'
import { getCategoryColorStyles } from '../../lib/category-colors'
import {
  getViewportAwareOverlayComboboxProps,
  viewportAwareDropdownMaxHeight,
} from '../../lib/mobile-combobox'
import { LifecycleBadge } from '../LifecycleBadge'
import type {
  AnalysisCategoryScope,
  AnalysisRuleCategoryView,
  CategoryManagementItem,
} from '../../api/models'

type CategoryScopeInputCategory = Pick<
  CategoryManagementItem,
  'id' | 'primary' | 'detailed' | 'color' | 'archivedAt'
>

interface CategoryScopeInputProps {
  label: string
  value: AnalysisCategoryScope
  onChange: (value: AnalysisCategoryScope) => void
  categories: Array<CategoryScopeInputCategory | AnalysisRuleCategoryView>
  disabled?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  viewportAwareDropdown?: boolean
}

const swatchStyle = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  flexShrink: 0,
}

function normalizeSelectedScope(value: AnalysisCategoryScope) {
  if (value.mode === 'selected') {
    return value
  }

  return {
    mode: 'selected' as const,
    categoryIds: [],
    includeUncategorized: false,
  }
}

function getCategoryLabel(category: CategoryScopeInputCategory) {
  return `${category.detailed} - ${category.primary}`
}

export function CategoryScopeInput({
  label,
  value,
  onChange,
  categories,
  disabled,
  size,
  viewportAwareDropdown = false,
}: CategoryScopeInputProps) {
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )
  const selectedScope = normalizeSelectedScope(value)
  const selectedCategoryIds = selectedScope.categoryIds ?? []
  const includeUncategorized = selectedScope.includeUncategorized ?? false
  const selectedValues = value.mode === 'selected' ? selectedCategoryIds : []
  const selectedCategories = selectedValues
    .map((categoryId) => categoryById.get(categoryId))
    .filter((category): category is CategoryScopeInputCategory =>
      Boolean(category),
    )

  const data = categories.map((category) => ({
    value: category.id,
    label: getCategoryLabel(category),
  }))

  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        {label}
      </Text>
      <SegmentedControl
        size={size}
        value={value.mode}
        onChange={(mode) =>
          onChange(
            mode === 'all'
              ? { mode: 'all' }
              : {
                  mode: 'selected',
                  categoryIds: selectedValues,
                  includeUncategorized,
                },
          )
        }
        data={[
          { value: 'all', label: 'All categories' },
          { value: 'selected', label: 'Selected categories' },
        ]}
        disabled={disabled}
        fullWidth
      />

      {value.mode === 'selected' && (
        <Stack gap="xs">
          <Group justify="space-between" gap="xs" wrap="wrap">
            <Checkbox
              size={size}
              label="Include uncategorized"
              checked={includeUncategorized}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  mode: 'selected',
                  categoryIds: selectedCategoryIds,
                  includeUncategorized: event.currentTarget.checked,
                })
              }
            />
            <Button
              variant="subtle"
              size={size === 'md' ? 'sm' : 'compact-sm'}
              disabled={
                disabled ||
                (selectedCategoryIds.length === 0 && !includeUncategorized)
              }
              onClick={() =>
                onChange({
                  mode: 'selected',
                  categoryIds: [],
                  includeUncategorized: false,
                })
              }
            >
              Clear all
            </Button>
          </Group>
          <MultiSelect
            aria-label={`${label} categories`}
            size={size}
            data={data}
            value={selectedCategoryIds}
            onChange={(categoryIds) =>
              onChange({
                mode: 'selected',
                categoryIds,
                includeUncategorized,
              })
            }
            placeholder="Search categories"
            searchable
            clearable
            nothingFoundMessage="No categories found"
            disabled={disabled}
            hidePickedOptions
            comboboxProps={
              viewportAwareDropdown
                ? getViewportAwareOverlayComboboxProps()
                : undefined
            }
            maxDropdownHeight={
              viewportAwareDropdown ? viewportAwareDropdownMaxHeight : 260
            }
            renderOption={({ option }) => {
              const category = categoryById.get(option.value)
              if (!category) {
                return option.label
              }

              return (
                <Group gap="xs" wrap="nowrap">
                  <Box
                    aria-hidden="true"
                    style={{
                      ...swatchStyle,
                      ...getCategoryColorStyles(category.color),
                    }}
                  />
                  <Box style={{ minWidth: 0 }}>
                    <Text size="sm" truncate>
                      {category.detailed}
                    </Text>
                    <Group gap={4} wrap="nowrap">
                      <Text size="xs" c="dimmed" truncate>
                        {category.primary}
                      </Text>
                      {category.archivedAt && (
                        <LifecycleBadge size="xs" status="Archived" />
                      )}
                    </Group>
                  </Box>
                </Group>
              )
            }}
          />
          {selectedCategories.length > 0 && (
            <Group gap={6} wrap="wrap">
              {selectedCategories.map((category) => {
                const swatch = (
                  <Box
                    aria-hidden="true"
                    style={{
                      ...swatchStyle,
                      ...getCategoryColorStyles(category.color),
                    }}
                  />
                )

                return category.archivedAt ? (
                  <LifecycleBadge
                    key={category.id}
                    status="Archived"
                    size="md"
                    leftSection={swatch}
                  >
                    {getCategoryLabel(category)}
                  </LifecycleBadge>
                ) : (
                  <Badge
                    key={category.id}
                    variant="light"
                    color="gray"
                    leftSection={swatch}
                  >
                    {getCategoryLabel(category)}
                  </Badge>
                )
              })}
            </Group>
          )}
        </Stack>
      )}
    </Stack>
  )
}
