import {
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, RotateCcw, Save, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  useCategoryControllerCreateCustom,
  useCategoryControllerFindAll,
  useCategoryControllerFindCustom,
  useCategoryControllerUpdateCustom,
} from '../../api/clients/spliceAPI'
import { formatCategoryName, formatPrimaryCategory } from '../../lib/format'
import type { Category } from '../../api/models'

function cleanCategoryLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeCategoryLabel(value: string): string {
  return cleanCategoryLabel(value).toLowerCase()
}

function getPrimaryDisplay(category: Category): string {
  return category.source === 'user'
    ? category.primary
    : formatPrimaryCategory(category.primary)
}

function getDetailedDisplay(category: Category): string {
  return category.source === 'user'
    ? category.detailed
    : formatCategoryName(category)
}

function getCategoryPairLabel(category: Category): string {
  return `${getPrimaryDisplay(category)} > ${getDetailedDisplay(category)}`
}

function categoryMatchesPair(
  category: Category,
  primary: string,
  detailed: string,
) {
  return (
    normalizeCategoryLabel(getPrimaryDisplay(category)) ===
      normalizeCategoryLabel(primary) &&
    normalizeCategoryLabel(getDetailedDisplay(category)) ===
      normalizeCategoryLabel(detailed)
  )
}

function getCategoryErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return 'Failed to save category'
  }

  const response = (error as { response?: { data?: unknown } }).response
  const data = response?.data

  if (typeof data !== 'object' || data === null) {
    return 'Failed to save category'
  }

  const category = (data as { category?: { label?: unknown } }).category
  if (category && typeof category.label === 'string') {
    return `Category already exists: ${category.label}`
  }

  const message = (data as { message?: unknown }).message
  return typeof message === 'string' ? message : 'Failed to save category'
}

function invalidateCategoryConsumers(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      typeof query.queryKey[0] === 'string' &&
      (query.queryKey[0].includes('/category') ||
        query.queryKey[0].includes('transaction')),
  })
}

export function CustomCategoriesSection() {
  const queryClient = useQueryClient()
  const [primary, setPrimary] = useState('')
  const [detailed, setDetailed] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  )
  const [editPrimary, setEditPrimary] = useState('')
  const [editDetailed, setEditDetailed] = useState('')

  const { data: visibleCategories = [] } = useCategoryControllerFindAll()
  const {
    data: customCategories = [],
    isLoading: isLoadingCustomCategories,
    isError: isCustomCategoriesError,
  } = useCategoryControllerFindCustom({ includeArchived: showArchived })

  const createCategory = useCategoryControllerCreateCustom<unknown>({
    mutation: {
      onSuccess: () => {
        setPrimary('')
        setDetailed('')
        invalidateCategoryConsumers(queryClient)
      },
    },
  })
  const updateCategory = useCategoryControllerUpdateCustom<unknown>({
    mutation: {
      onSuccess: () => {
        setEditingCategoryId(null)
        setEditPrimary('')
        setEditDetailed('')
        invalidateCategoryConsumers(queryClient)
      },
    },
  })

  const primaryOptions = useMemo(
    () =>
      Array.from(
        new Map(
          visibleCategories.map((category) => [
            normalizeCategoryLabel(getPrimaryDisplay(category)),
            getPrimaryDisplay(category),
          ]),
        ).values(),
      ).sort((left, right) => left.localeCompare(right)),
    [visibleCategories],
  )

  const detailedOptions = useMemo(() => {
    const normalizedPrimary = normalizeCategoryLabel(primary)

    return Array.from(
      new Map(
        visibleCategories
          .filter(
            (category) =>
              !normalizedPrimary ||
              normalizeCategoryLabel(getPrimaryDisplay(category)) ===
                normalizedPrimary,
          )
          .map((category) => [
            normalizeCategoryLabel(getDetailedDisplay(category)),
            getDetailedDisplay(category),
          ]),
      ).values(),
    ).sort((left, right) => left.localeCompare(right))
  }, [primary, visibleCategories])

  const duplicateCategory = useMemo(
    () =>
      cleanCategoryLabel(primary) && cleanCategoryLabel(detailed)
        ? visibleCategories.find((category) =>
            categoryMatchesPair(category, primary, detailed),
          )
        : undefined,
    [detailed, primary, visibleCategories],
  )

  const matchingPairs = useMemo(() => {
    const normalizedPrimary = normalizeCategoryLabel(primary)
    const normalizedDetailed = normalizeCategoryLabel(detailed)

    if (!normalizedPrimary && !normalizedDetailed) {
      return []
    }

    return visibleCategories
      .filter((category) => {
        const primaryMatches =
          !normalizedPrimary ||
          normalizeCategoryLabel(getPrimaryDisplay(category)).includes(
            normalizedPrimary,
          )
        const detailedMatches =
          !normalizedDetailed ||
          normalizeCategoryLabel(getDetailedDisplay(category)).includes(
            normalizedDetailed,
          )

        return primaryMatches && detailedMatches
      })
      .slice(0, 4)
  }, [detailed, primary, visibleCategories])

  const canCreate =
    cleanCategoryLabel(primary).length > 0 &&
    cleanCategoryLabel(detailed).length > 0 &&
    !duplicateCategory &&
    !createCategory.isPending

  function startEditing(category: Category) {
    setEditingCategoryId(category.id)
    setEditPrimary(category.primary)
    setEditDetailed(category.detailed)
  }

  function saveEdit(category: Category) {
    updateCategory.mutate({
      id: category.id,
      data: {
        primary: editPrimary,
        detailed: editDetailed,
      },
    })
  }

  return (
    <Paper
      withBorder
      p="lg"
      radius="md"
      maw={720}
      data-testid="custom-categories-section"
    >
      <Stack gap="lg">
        <div>
          <Group gap="xs" mb="xs">
            <Text fw={600}>Custom categories</Text>
            <Badge size="sm" variant="light">
              User
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Add personal categories for transaction overrides.
          </Text>
        </div>

        <Stack gap="sm">
          <Group align="flex-start" gap="sm" wrap="wrap">
            <Autocomplete
              label="Primary category"
              placeholder="e.g. Home Projects"
              data={primaryOptions}
              value={primary}
              onChange={setPrimary}
              size="md"
              data-testid="custom-category-primary-input"
              style={{ flex: '1 1 220px' }}
            />
            <Autocomplete
              label="Secondary category"
              placeholder="e.g. Hardware"
              data={detailedOptions}
              value={detailed}
              onChange={setDetailed}
              size="md"
              data-testid="custom-category-detailed-input"
              style={{ flex: '1 1 220px' }}
            />
            <Button
              mt={25}
              onClick={() =>
                createCategory.mutate({
                  data: { primary, detailed },
                })
              }
              disabled={!canCreate}
              loading={createCategory.isPending}
            >
              Create category
            </Button>
          </Group>

          {duplicateCategory && (
            <Alert color="yellow" title="Existing match">
              {getCategoryPairLabel(duplicateCategory)}
            </Alert>
          )}

          {!duplicateCategory && matchingPairs.length > 0 && (
            <Stack gap={4}>
              <Text size="xs" c="dimmed">
                Similar categories
              </Text>
              {matchingPairs.map((category) => (
                <Text key={category.id} size="sm">
                  {getCategoryPairLabel(category)}
                  {category.source === 'user' && (
                    <Badge size="xs" variant="light" ml="xs">
                      User
                    </Badge>
                  )}
                </Text>
              ))}
            </Stack>
          )}

          {createCategory.isError && (
            <Alert color="red" title="Error">
              {getCategoryErrorMessage(createCategory.error)}
            </Alert>
          )}
        </Stack>

        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={600}>Your custom categories</Text>
            <Checkbox
              label="Show archived"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.currentTarget.checked)}
            />
          </Group>

          {isLoadingCustomCategories && (
            <Group justify="center" py="sm">
              <Loader size="sm" />
            </Group>
          )}

          {isCustomCategoriesError && (
            <Alert color="red" title="Error">
              Failed to load custom categories
            </Alert>
          )}

          {!isLoadingCustomCategories &&
            !isCustomCategoriesError &&
            customCategories.length === 0 && (
              <Text size="sm" c="dimmed">
                No custom categories yet.
              </Text>
            )}

          {customCategories.map((category) => {
            const isEditing = editingCategoryId === category.id
            const isArchived = category.archivedAt !== null

            return (
              <Group
                key={category.id}
                justify="space-between"
                wrap="nowrap"
                p="xs"
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 6,
                }}
              >
                {isEditing ? (
                  <Group gap="xs" style={{ flex: 1 }} wrap="wrap">
                    <Autocomplete
                      aria-label="Edit primary category"
                      data={primaryOptions}
                      value={editPrimary}
                      onChange={setEditPrimary}
                      size="md"
                      style={{ flex: '1 1 160px' }}
                    />
                    <Autocomplete
                      aria-label="Edit secondary category"
                      data={detailedOptions}
                      value={editDetailed}
                      onChange={setEditDetailed}
                      size="md"
                      style={{ flex: '1 1 160px' }}
                    />
                  </Group>
                ) : (
                  <div>
                    <Group gap="xs">
                      <Text size="sm" fw={500}>
                        {category.primary}
                      </Text>
                      <Text size="sm" c="dimmed">
                        &gt;
                      </Text>
                      <Text size="sm">{category.detailed}</Text>
                      <Badge size="xs" variant="light">
                        User
                      </Badge>
                      {isArchived && (
                        <Badge size="xs" color="gray" variant="light">
                          Archived
                        </Badge>
                      )}
                    </Group>
                  </div>
                )}

                <Group gap={4} wrap="nowrap">
                  {isEditing ? (
                    <>
                      <Tooltip label="Save">
                        <ActionIcon
                          aria-label="Save category"
                          size="sm"
                          onClick={() => saveEdit(category)}
                          loading={
                            updateCategory.isPending &&
                            updateCategory.variables.id === category.id
                          }
                        >
                          <Save size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Cancel">
                        <ActionIcon
                          aria-label="Cancel category edit"
                          size="sm"
                          variant="subtle"
                          onClick={() => setEditingCategoryId(null)}
                        >
                          <X size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </>
                  ) : (
                    <>
                      <Tooltip label="Edit category">
                        <ActionIcon
                          aria-label="Edit category"
                          size="sm"
                          variant="subtle"
                          onClick={() => startEditing(category)}
                        >
                          <Pencil size={14} />
                        </ActionIcon>
                      </Tooltip>
                      {isArchived ? (
                        <Tooltip label="Restore category">
                          <ActionIcon
                            aria-label="Restore category"
                            size="sm"
                            variant="subtle"
                            onClick={() =>
                              updateCategory.mutate({
                                id: category.id,
                                data: { archived: false },
                              })
                            }
                            loading={
                              updateCategory.isPending &&
                              updateCategory.variables.id === category.id
                            }
                          >
                            <RotateCcw size={14} />
                          </ActionIcon>
                        </Tooltip>
                      ) : (
                        <Tooltip label="Archive category">
                          <ActionIcon
                            aria-label="Archive category"
                            size="sm"
                            variant="subtle"
                            onClick={() =>
                              updateCategory.mutate({
                                id: category.id,
                                data: { archived: true },
                              })
                            }
                            loading={
                              updateCategory.isPending &&
                              updateCategory.variables.id === category.id
                            }
                          >
                            <Archive size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </>
                  )}
                </Group>
              </Group>
            )
          })}

          {updateCategory.isError && (
            <Alert color="red" title="Error">
              {getCategoryErrorMessage(updateCategory.error)}
            </Alert>
          )}
        </Stack>
      </Stack>
    </Paper>
  )
}
