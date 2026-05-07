import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Pagination,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Eye,
  EyeOff,
  Info,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  useCategoryControllerBulkUpdateCustom,
  useCategoryControllerBulkUpdateVisibility,
  useCategoryControllerCreateCustom,
  useCategoryControllerFindManagement,
  useCategoryControllerUpdateCustom,
} from '../../api/clients/spliceAPI'
import { formatCategoryName, formatPrimaryCategory } from '../../lib/format'
import type {
  BulkCategoryActionResponse,
  CategoryConflict,
  CategoryManagementItem,
} from '../../api/models'

type SourceFilter = 'all' | 'system' | 'custom'
type VisibilityFilter = 'all' | 'visible' | 'hidden'
type SortKey = 'category' | 'source' | 'status' | 'used'
type SortDirection = 'asc' | 'desc'
type PanelMode = 'create' | 'edit-custom' | 'view-system' | 'view-archived'
type PanelState = { mode: PanelMode; category?: CategoryManagementItem } | null

const PAGE_SIZE = 12

function cleanCategoryLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeCategoryLabel(value: string): string {
  return cleanCategoryLabel(value).toLowerCase()
}

function getPrimaryDisplay(category: CategoryManagementItem): string {
  return category.source === 'user'
    ? category.primary
    : formatPrimaryCategory(category.primary)
}

function getDetailedDisplay(category: CategoryManagementItem): string {
  return category.source === 'user'
    ? category.detailed
    : formatCategoryName(category)
}

function getCategoryPairLabel(category: CategoryManagementItem): string {
  return `${getPrimaryDisplay(category)} > ${getDetailedDisplay(category)}`
}

function getStatus(category: CategoryManagementItem): 'Archived' | 'Hidden' | 'Visible' {
  if (category.archivedAt !== null && category.archivedAt !== undefined) {
    return 'Archived'
  }

  return category.isHidden ? 'Hidden' : 'Visible'
}

function getCategoryConflictFromManagementItem(
  category: CategoryManagementItem,
): CategoryConflict {
  return {
    categoryId: category.id,
    label: getCategoryPairLabel(category),
    primary: category.primary,
    detailed: category.detailed,
    source: category.source === 'user' ? 'user' : 'plaid',
    archivedAt: category.archivedAt,
    isHidden: category.isHidden,
  }
}

function getCategoryConflict(error: unknown): CategoryConflict | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const response = (error as { response?: { data?: unknown } }).response
  const data = response?.data
  if (typeof data !== 'object' || data === null) {
    return null
  }

  const category = (data as { category?: unknown }).category
  if (typeof category !== 'object' || category === null) {
    return null
  }

  return category as CategoryConflict
}

function getCategoryErrorMessage(error: unknown): string {
  const conflict = getCategoryConflict(error)
  if (conflict) {
    return `Category already exists: ${conflict.label}`
  }

  if (typeof error !== 'object' || error === null) {
    return 'Failed to save category'
  }

  const response = (error as { response?: { data?: unknown } }).response
  const data = response?.data

  if (typeof data !== 'object' || data === null) {
    return 'Failed to save category'
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

function showSkippedNotification(result: BulkCategoryActionResponse) {
  if (result.skipped.length === 0) {
    return
  }

  notifications.show({
    color: 'yellow',
    title: 'Some categories were skipped',
    message: `${result.updated} updated, ${result.skipped.length} skipped because the selection changed or conflicted.`,
  })
}

function getSkippedReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    archived: 'Archived',
    duplicate_conflict: 'Duplicate conflict',
    not_found: 'Not found',
    not_owned: 'Not owned',
    system_category: 'System category',
  }

  return labels[reason] ?? reason
}

function getDefaultRank(category: CategoryManagementItem) {
  if (category.archivedAt) return 3
  if (category.isHidden) return 2
  return 1
}

export function CustomCategoriesSection() {
  const queryClient = useQueryClient()
  const [archivedMode, setArchivedMode] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>('all')
  const [primaryFilter, setPrimaryFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('category')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [panel, setPanel] = useState<PanelState>(null)
  const [primary, setPrimary] = useState('')
  const [detailed, setDetailed] = useState('')
  const [description, setDescription] = useState('')
  const [bulkPrimary, setBulkPrimary] = useState('')
  const [lastBulkResult, setLastBulkResult] =
    useState<BulkCategoryActionResponse | null>(null)

  const {
    data: categories = [],
    isLoading,
    isError,
  } = useCategoryControllerFindManagement({ archived: archivedMode })
  const { data: comparisonCategories = [] } =
    useCategoryControllerFindManagement({ archived: !archivedMode })

  const createCategory = useCategoryControllerCreateCustom<unknown>({
    mutation: {
      onSuccess: () => {
        setPrimary('')
        setDetailed('')
        setDescription('')
        setPanel(null)
        invalidateCategoryConsumers(queryClient)
      },
    },
  })
  const updateCategory = useCategoryControllerUpdateCustom<unknown>({
    mutation: {
      onSuccess: () => {
        setPanel(null)
        setPrimary('')
        setDetailed('')
        setDescription('')
        invalidateCategoryConsumers(queryClient)
      },
    },
  })
  const updateVisibility = useCategoryControllerBulkUpdateVisibility({
    mutation: {
      onSuccess: (result) => {
        setLastBulkResult(result.skipped.length > 0 ? result : null)
        showSkippedNotification(result)
        invalidateCategoryConsumers(queryClient)
      },
    },
  })
  const bulkUpdateCustom = useCategoryControllerBulkUpdateCustom({
    mutation: {
      onSuccess: (result) => {
        setLastBulkResult(result.skipped.length > 0 ? result : null)
        showSkippedNotification(result)
        setBulkPrimary('')
        invalidateCategoryConsumers(queryClient)
      },
    },
  })

  useEffect(() => {
    setSelectedIds(new Set())
    setPanel(null)
    setLastBulkResult(null)
    setPage(1)
  }, [archivedMode, sourceFilter, visibilityFilter, primaryFilter, search])

  const primaryOptions = useMemo(
    () =>
      Array.from(
        new Map(
          categories.map((category) => [
            normalizeCategoryLabel(getPrimaryDisplay(category)),
            getPrimaryDisplay(category),
          ]),
        ).values(),
      ).sort((left, right) => left.localeCompare(right)),
    [categories],
  )
  const allManagementCategories = useMemo(() => {
    const categoriesById = new Map<string, CategoryManagementItem>()
    ;[...categories, ...comparisonCategories].forEach((category) => {
      categoriesById.set(category.id, category)
    })
    return Array.from(categoriesById.values())
  }, [categories, comparisonCategories])

  const formDuplicateConflict = useMemo(() => {
    const normalizedPrimary = normalizeCategoryLabel(primary)
    const normalizedDetailed = normalizeCategoryLabel(detailed)
    if (!normalizedPrimary || !normalizedDetailed) {
      return null
    }

    return (
      allManagementCategories.find((category) => {
        if (panel?.mode === 'edit-custom' && panel.category?.id === category.id) {
          return false
        }

        return (
          normalizeCategoryLabel(getPrimaryDisplay(category)) ===
            normalizedPrimary &&
          normalizeCategoryLabel(getDetailedDisplay(category)) ===
            normalizedDetailed
        )
      }) ?? null
    )
  }, [
    allManagementCategories,
    detailed,
    panel?.category?.id,
    panel?.mode,
    primary,
  ])

  const filteredCategories = useMemo(() => {
    const normalizedSearch = normalizeCategoryLabel(search)

    return categories
      .filter((category) => {
        if (archivedMode && category.source !== 'user') return false
        if (!archivedMode && category.archivedAt) return false

        if (!archivedMode && sourceFilter !== 'all') {
          if (sourceFilter === 'system' && category.source === 'user') {
            return false
          }
          if (sourceFilter === 'custom' && category.source !== 'user') {
            return false
          }
        }

        if (!archivedMode && visibilityFilter !== 'all') {
          if (visibilityFilter === 'visible' && category.isHidden) return false
          if (visibilityFilter === 'hidden' && !category.isHidden) return false
        }

        if (
          primaryFilter &&
          normalizeCategoryLabel(getPrimaryDisplay(category)) !==
            normalizeCategoryLabel(primaryFilter)
        ) {
          return false
        }

        if (!normalizedSearch) return true

        return [
          getPrimaryDisplay(category),
          getDetailedDisplay(category),
          getCategoryPairLabel(category),
          category.source === 'user' ? 'custom' : 'system',
          getStatus(category),
        ].some((value) =>
          normalizeCategoryLabel(value).includes(normalizedSearch),
        )
      })
      .sort((left, right) => {
        let result = 0
        if (sortKey === 'category') {
          result =
            getDefaultRank(left) - getDefaultRank(right) ||
            getCategoryPairLabel(left).localeCompare(getCategoryPairLabel(right))
        } else if (sortKey === 'source') {
          result = (left.source ?? 'plaid').localeCompare(right.source ?? 'plaid')
        } else if (sortKey === 'status') {
          result = getStatus(left).localeCompare(getStatus(right))
        } else {
          result = (left.transactionCount ?? 0) - (right.transactionCount ?? 0)
        }

        return sortDirection === 'asc' ? result : -result
      })
  }, [
    archivedMode,
    categories,
    primaryFilter,
    search,
    sortDirection,
    sortKey,
    sourceFilter,
    visibilityFilter,
  ])

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / PAGE_SIZE))
  const pageCategories = filteredCategories.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  )
  const selectedRows = categories.filter((category) =>
    selectedIds.has(category.id),
  )
  const categoryLabelById = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category.id,
          getCategoryPairLabel(category),
        ]),
      ),
    [categories],
  )
  const allSelectedRowsActive = selectedRows.every(
    (category) => !category.archivedAt,
  )
  const canHide =
    selectedRows.length > 0 &&
    allSelectedRowsActive &&
    selectedRows.some((category) => !category.isHidden)
  const canShow =
    selectedRows.length > 0 &&
    allSelectedRowsActive &&
    selectedRows.some((category) => category.isHidden)
  const canArchive =
    selectedRows.length > 0 &&
    selectedRows.every(
      (category) => category.source === 'user' && !category.archivedAt,
    )
  const canRestore =
    selectedRows.length > 0 &&
    selectedRows.every(
      (category) => category.source === 'user' && Boolean(category.archivedAt),
    )
  const canSetPrimary = canArchive && cleanCategoryLabel(bulkPrimary).length > 0
  const allPageSelected =
    pageCategories.length > 0 &&
    pageCategories.every((category) => selectedIds.has(category.id))

  function openCreatePanel() {
    setPanel({ mode: 'create' })
    setPrimary('')
    setDetailed('')
    setDescription('')
  }

  function openEditPanel(category: CategoryManagementItem) {
    setPanel({ mode: 'edit-custom', category })
    setPrimary(category.primary)
    setDetailed(category.detailed)
    setDescription(category.description)
  }

  function toggleSelected(categoryId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  function togglePageSelection() {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (allPageSelected) {
        pageCategories.forEach((category) => next.delete(category.id))
      } else {
        pageCategories.forEach((category) => next.add(category.id))
      }
      return next
    })
  }

  function handleSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(nextSortKey)
      setSortDirection('asc')
    }
  }

  function submitCreateOrEdit() {
    if (panel?.mode === 'edit-custom' && panel.category) {
      updateCategory.mutate({
        id: panel.category.id,
        data: { primary, detailed, description },
      })
      return
    }

    createCategory.mutate({
      data: { primary, detailed, description },
    })
  }

  function hideOrShow(ids: Array<string>, hidden: boolean) {
    updateVisibility.mutate({ data: { categoryIds: ids, hidden } })
  }

  function archiveOrRestore(ids: Array<string>, action: 'archive' | 'restore') {
    bulkUpdateCustom.mutate({ data: { categoryIds: ids, action } })
  }

  function restoreConflictCategory(categoryId: string) {
    updateCategory.mutate({
      id: categoryId,
      data: { archived: false },
    })
    setArchivedMode(false)
  }

  function renderConflictAction(error: unknown) {
    const conflict = getCategoryConflict(error)
    if (!conflict) return null

    if (conflict.source === 'user' && conflict.archivedAt) {
      return (
        <Button
          size="xs"
          variant="light"
          onClick={() => restoreConflictCategory(conflict.categoryId)}
          mt="xs"
        >
          Restore existing category
        </Button>
      )
    }

    if (conflict.source === 'plaid' && conflict.isHidden) {
      return (
        <Button
          size="xs"
          variant="light"
          onClick={() => hideOrShow([conflict.categoryId], false)}
          mt="xs"
        >
          Show existing system category
        </Button>
      )
    }

    return null
  }

  function renderManagementConflictAction(category: CategoryManagementItem) {
    if (category.source === 'user' && category.archivedAt) {
      return (
        <Button
          size="xs"
          variant="light"
          onClick={() => restoreConflictCategory(category.id)}
          mt="xs"
        >
          Restore existing category
        </Button>
      )
    }

    if (category.source !== 'user' && category.isHidden) {
      return (
        <Button
          size="xs"
          variant="light"
          onClick={() => hideOrShow([category.id], false)}
          mt="xs"
        >
          Show existing system category
        </Button>
      )
    }

    return null
  }

  function renderBulkButton(
    label: string,
    enabled: boolean,
    tooltip: string,
    onClick: () => void,
  ) {
    return (
      <Tooltip label={enabled ? label : tooltip}>
        <span>
          <Button size="xs" variant="light" disabled={!enabled} onClick={onClick}>
            {label}
          </Button>
        </span>
      </Tooltip>
    )
  }

  return (
    <Stack gap="md" data-testid="custom-categories-section">
      <Group justify="space-between" align="flex-end">
        <div>
          <Text fw={700} size="lg">
            Categories
          </Text>
          <Text size="sm" c="dimmed">
            Manage system and custom categories used by transaction dropdowns.
          </Text>
        </div>
        <Button leftSection={<Plus size={16} />} onClick={openCreatePanel}>
          New category
        </Button>
      </Group>

      <Group align="flex-end" gap="sm" wrap="wrap">
        <TextInput
          aria-label="Search categories"
          placeholder="Search categories..."
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          style={{ flex: '1 1 240px' }}
        />
        <SegmentedControl
          value={sourceFilter}
          onChange={(value) => setSourceFilter(value as SourceFilter)}
          data={[
            { label: 'All', value: 'all' },
            { label: 'System', value: 'system' },
            { label: 'Custom', value: 'custom' },
          ]}
          disabled={archivedMode}
        />
        <Select
          aria-label="Visibility"
          value={visibilityFilter}
          onChange={(value) =>
            setVisibilityFilter((value as VisibilityFilter | null) ?? 'all')
          }
          data={[
            { value: 'all', label: 'All visibility' },
            { value: 'visible', label: 'Visible' },
            { value: 'hidden', label: 'Hidden' },
          ]}
          disabled={archivedMode}
          w={170}
        />
        <Checkbox
          label="Archived"
          checked={archivedMode}
          onChange={(event) => setArchivedMode(event.currentTarget.checked)}
        />
        <Select
          aria-label="Primary category"
          value={primaryFilter}
          onChange={setPrimaryFilter}
          data={[
            { value: '', label: 'All primary categories' },
            ...primaryOptions.map((option) => ({ value: option, label: option })),
          ]}
          clearable
          searchable
          placeholder="Primary category"
          w={220}
        />
      </Group>

      {selectedRows.length > 0 && (
        <Paper withBorder p="xs" radius="sm">
          <Group gap="xs" wrap="wrap">
            <Text size="sm" fw={600}>
              {selectedRows.length} selected
            </Text>
            {renderBulkButton('Hide from dropdowns', canHide, 'Select active visible categories to hide.', () =>
              hideOrShow(
                selectedRows.map((category) => category.id),
                true,
              ),
            )}
            {renderBulkButton('Show in dropdowns', canShow, 'Select active hidden categories to show.', () =>
              hideOrShow(
                selectedRows.map((category) => category.id),
                false,
              ),
            )}
            {renderBulkButton('Archive custom', canArchive, 'Select active custom categories only.', () =>
              archiveOrRestore(
                selectedRows.map((category) => category.id),
                'archive',
              ),
            )}
            {renderBulkButton('Restore custom', canRestore, 'Select archived custom categories only.', () =>
              archiveOrRestore(
                selectedRows.map((category) => category.id),
                'restore',
              ),
            )}
            {!archivedMode && (
              <>
                <TextInput
                  aria-label="Bulk primary category"
                  placeholder="New primary"
                  value={bulkPrimary}
                  onChange={(event) => setBulkPrimary(event.currentTarget.value)}
                  size="xs"
                  w={180}
                />
                {renderBulkButton('Set primary', canSetPrimary, 'Select active custom categories and enter a primary.', () =>
                  bulkUpdateCustom.mutate({
                    data: {
                      categoryIds: selectedRows.map((category) => category.id),
                      action: 'setPrimary',
                      primary: bulkPrimary,
                    },
                  }),
                )}
              </>
            )}
          </Group>
          {lastBulkResult && (
            <Alert color="yellow" title="Some categories were skipped" mt="xs">
              <Stack gap={4}>
                <Text size="sm">
                  {lastBulkResult.updated} updated,{' '}
                  {lastBulkResult.skipped.length} skipped.
                </Text>
                {lastBulkResult.skipped.map((item) => (
                  <Text key={item.categoryId} size="xs">
                    {categoryLabelById.get(item.categoryId) ??
                      `Category ${item.categoryId}`}
                    : {getSkippedReasonLabel(item.reason)}
                  </Text>
                ))}
              </Stack>
            </Alert>
          )}
        </Paper>
      )}

      {isLoading && (
        <Group justify="center" py="lg">
          <Loader />
        </Group>
      )}

      {isError && (
        <Alert color="red" title="Error">
          Failed to load categories
        </Alert>
      )}

      {!isLoading && !isError && (
        <Group align="stretch" gap="md" wrap="nowrap">
          <Paper withBorder radius="md" style={{ flex: 1, overflow: 'hidden' }}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>
                    <Checkbox
                      aria-label="Select page categories"
                      checked={allPageSelected}
                      onChange={togglePageSelection}
                    />
                  </Table.Th>
                  <Table.Th>
                    <Button variant="subtle" size="compact-sm" onClick={() => handleSort('category')}>
                      Category
                    </Button>
                  </Table.Th>
                  <Table.Th>
                    <Button variant="subtle" size="compact-sm" onClick={() => handleSort('source')}>
                      Source
                    </Button>
                  </Table.Th>
                  <Table.Th>
                    <Button variant="subtle" size="compact-sm" onClick={() => handleSort('status')}>
                      Status
                    </Button>
                  </Table.Th>
                  <Table.Th>
                    <Button variant="subtle" size="compact-sm" onClick={() => handleSort('used')}>
                      Used
                    </Button>
                  </Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pageCategories.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text c="dimmed" size="sm" ta="center" py="lg">
                        No categories match the current filters.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  pageCategories.map((category) => {
                    const status = getStatus(category)
                    const isCustom = category.source === 'user'
                    const isArchived = Boolean(category.archivedAt)

                    return (
                      <Table.Tr key={category.id}>
                        <Table.Td>
                          <Checkbox
                            aria-label={`Select ${getCategoryPairLabel(category)}`}
                            checked={selectedIds.has(category.id)}
                            onChange={() => toggleSelected(category.id)}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" fw={600}>
                            {getPrimaryDisplay(category)}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {getDetailedDisplay(category)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            size="sm"
                            color={isCustom ? 'violet' : 'blue'}
                            variant="light"
                          >
                            {isCustom ? 'Custom' : 'System'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Tooltip
                            label={
                              status === 'Hidden'
                                ? 'Hidden from manual dropdowns'
                                : status
                            }
                          >
                            <Badge
                              size="sm"
                              color={
                                status === 'Visible'
                                  ? 'green'
                                  : status === 'Hidden'
                                    ? 'gray'
                                    : 'orange'
                              }
                              variant="light"
                            >
                              {status}
                            </Badge>
                          </Tooltip>
                        </Table.Td>
                        <Table.Td>{category.transactionCount ?? 0}</Table.Td>
                        <Table.Td>
                          <Group gap={4} wrap="nowrap">
                            <Tooltip label="Details">
                              <ActionIcon
                                aria-label="View category details"
                                variant="subtle"
                                onClick={() =>
                                  isCustom && !isArchived
                                    ? openEditPanel(category)
                                    : setPanel({
                                        mode: isArchived
                                          ? 'view-archived'
                                          : 'view-system',
                                        category,
                                      })
                                }
                              >
                                {isCustom && !isArchived ? (
                                  <Pencil size={16} />
                                ) : (
                                  <Info size={16} />
                                )}
                              </ActionIcon>
                            </Tooltip>
                            {!isArchived && (
                              <Tooltip
                                label={
                                  category.isHidden
                                    ? 'Show in dropdowns'
                                    : 'Hide from dropdowns'
                                }
                              >
                                <ActionIcon
                                  aria-label={
                                    category.isHidden
                                      ? 'Show in dropdowns'
                                      : 'Hide from dropdowns'
                                  }
                                  variant="subtle"
                                  onClick={() =>
                                    hideOrShow([category.id], !category.isHidden)
                                  }
                                >
                                  {category.isHidden ? (
                                    <Eye size={16} />
                                  ) : (
                                    <EyeOff size={16} />
                                  )}
                                </ActionIcon>
                              </Tooltip>
                            )}
                            {isCustom && !isArchived && (
                              <Tooltip label="Archive category">
                                <ActionIcon
                                  aria-label="Archive category"
                                  variant="subtle"
                                  onClick={() =>
                                    archiveOrRestore([category.id], 'archive')
                                  }
                                >
                                  <Archive size={16} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                            {isCustom && isArchived && (
                              <Tooltip label="Restore category">
                                <ActionIcon
                                  aria-label="Restore category"
                                  variant="subtle"
                                  onClick={() =>
                                    archiveOrRestore([category.id], 'restore')
                                  }
                                >
                                  <RotateCcw size={16} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    )
                  })
                )}
              </Table.Tbody>
            </Table>
            <Group justify="space-between" p="sm">
              <Text size="sm" c="dimmed">
                Showing {pageCategories.length} of {filteredCategories.length}
              </Text>
              <Pagination value={page} onChange={setPage} total={totalPages} />
            </Group>
          </Paper>

          {panel && (
            <Paper withBorder radius="md" p="md" w={340}>
              <Group justify="space-between" mb="sm">
                <Text fw={700}>
                  {panel.mode === 'create'
                    ? 'New custom category'
                    : panel.mode === 'edit-custom'
                      ? 'Edit custom category'
                      : 'Category details'}
                </Text>
                <ActionIcon
                  aria-label="Close category panel"
                  variant="subtle"
                  onClick={() => setPanel(null)}
                >
                  <X size={16} />
                </ActionIcon>
              </Group>

              {panel.mode === 'view-system' || panel.mode === 'view-archived' ? (
                <Stack gap="sm">
                  {panel.category && (
                    <>
                      <Text size="sm" fw={600}>
                        {getCategoryPairLabel(panel.category)}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {panel.category.description || 'No description.'}
                      </Text>
                      <Badge w="fit-content" variant="light">
                        {getStatus(panel.category)}
                      </Badge>
                    </>
                  )}
                </Stack>
              ) : (
                <Stack gap="sm">
                  <TextInput
                    label="Primary category"
                    value={primary}
                    onChange={(event) => setPrimary(event.currentTarget.value)}
                    data-testid="custom-category-primary-input"
                  />
                  <TextInput
                    label="Secondary category"
                    value={detailed}
                    onChange={(event) => setDetailed(event.currentTarget.value)}
                    data-testid="custom-category-detailed-input"
                  />
                  <Textarea
                    label="Description"
                    value={description}
                    onChange={(event) =>
                      setDescription(event.currentTarget.value)
                    }
                    minRows={3}
                  />
                  {panel.mode === 'edit-custom' && (
                    <Text size="xs" c="dimmed">
                      Renaming a custom category updates existing transactions
                      that use it.
                    </Text>
                  )}
                  {formDuplicateConflict && (
                    <Alert color="yellow" title="Duplicate detected">
                      <Text size="sm">
                        Category already exists:{' '}
                        {
                          getCategoryConflictFromManagementItem(
                            formDuplicateConflict,
                          ).label
                        }
                      </Text>
                      {renderManagementConflictAction(formDuplicateConflict)}
                    </Alert>
                  )}
                  {(createCategory.isError || updateCategory.isError) && (
                    <Alert color="yellow" title="Duplicate detected">
                      <Text size="sm">
                        {getCategoryErrorMessage(
                          createCategory.error ?? updateCategory.error,
                        )}
                      </Text>
                      {renderConflictAction(
                        createCategory.error ?? updateCategory.error,
                      )}
                    </Alert>
                  )}
                  <Group justify="flex-end">
                    <Button variant="subtle" onClick={() => setPanel(null)}>
                      Cancel
                    </Button>
                    <Button
                      leftSection={<Save size={16} />}
                      onClick={submitCreateOrEdit}
                      loading={
                        createCategory.isPending || updateCategory.isPending
                      }
                      disabled={
                        !cleanCategoryLabel(primary) ||
                        !cleanCategoryLabel(detailed) ||
                        Boolean(formDuplicateConflict)
                      }
                    >
                      {panel.mode === 'create' ? 'Create category' : 'Save'}
                    </Button>
                  </Group>
                </Stack>
              )}
            </Paper>
          )}
        </Group>
      )}
    </Stack>
  )
}
