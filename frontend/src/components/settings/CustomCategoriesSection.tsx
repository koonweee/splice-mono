import {
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Drawer,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Copy,
  Filter,
  Info,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  X,
} from 'lucide-react'
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table'
import { useEffect, useMemo, useState } from 'react'
import {
  useCategoryControllerBulkUpdateCustom,
  useCategoryControllerCreateCustom,
  useCategoryControllerFindManagement,
  useCategoryControllerUpdateCustom,
} from '../../api/clients/spliceAPI'
import { CategorySelect } from '../categories/CategorySelect'
import tableChrome from '../MantineTableChrome.module.css'
import type {
  MRT_ColumnDef,
  MRT_RowSelectionState,
  MRT_SortingState,
} from 'mantine-react-table'
import type { CSSProperties, ReactNode } from 'react'
import type {
  BulkCategoryActionResponse,
  CategoryManagementItem,
} from '../../api/models'
import type { CategorySelectOption } from '../categories/CategorySelect'

type PanelMode = 'create' | 'edit-custom' | 'view-archived'
type PanelState = { mode: PanelMode; category?: CategoryManagementItem } | null
type CategoryConflictView = {
  categoryId: string
  label: string
  primary: string
  detailed: string
  archivedAt?: string | null
}

const VIRTUAL_ROW_HEIGHT = 66
const TABLE_HEADER_HEIGHT = 52
const SELECT_COLUMN_WIDTH = 56
const STATUS_COLUMN_WIDTH = 130
const USED_COLUMN_WIDTH = 88
const ACTIONS_COLUMN_WIDTH = 48
const ACTION_ICON_SIZE = 36

const tableHeaderCellStyle = {
  height: TABLE_HEADER_HEIGHT,
  paddingBottom: 0,
  paddingTop: 0,
  verticalAlign: 'middle',
} satisfies CSSProperties

const tableBodyCellStyle = {
  height: VIRTUAL_ROW_HEIGHT,
  paddingBottom: 0,
  paddingTop: 0,
  verticalAlign: 'middle',
} satisfies CSSProperties

const tableActionsHeaderStyle = {
  ...tableHeaderCellStyle,
  paddingLeft: 0,
  paddingRight: 8,
  justifyContent: 'flex-end',
  textAlign: 'right',
} satisfies CSSProperties

const tableActionsCellStyle = {
  ...tableBodyCellStyle,
  paddingLeft: 0,
  paddingRight: 2,
  justifyContent: 'flex-end',
  textAlign: 'right',
} satisfies CSSProperties

const tableClippedBodyCellStyle = {
  ...tableBodyCellStyle,
  overflow: 'hidden',
} satisfies CSSProperties

const categoryCellContentStyle = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  minWidth: 0,
} satisfies CSSProperties

function cleanCategoryLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeCategoryLabel(value: string): string {
  return cleanCategoryLabel(value).toLowerCase()
}

function getPrimaryDisplay(category: CategoryManagementItem): string {
  return category.primary
}

function getDetailedDisplay(category: CategoryManagementItem): string {
  return category.detailed
}

function getCategoryPairLabel(category: CategoryManagementItem): string {
  return `${getPrimaryDisplay(category)} > ${getDetailedDisplay(category)}`
}

function getStatus(category: CategoryManagementItem): 'Archived' | 'Active' {
  if (category.archivedAt !== null && category.archivedAt !== undefined) {
    return 'Archived'
  }

  return 'Active'
}

function getCategoryConflictFromManagementItem(
  category: CategoryManagementItem,
): CategoryConflictView {
  return {
    categoryId: category.id,
    label: getCategoryPairLabel(category),
    primary: category.primary,
    detailed: category.detailed,
    archivedAt: category.archivedAt,
  }
}

function getCategoryConflict(error: unknown): CategoryConflictView | null {
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

  return category as CategoryConflictView
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
  }

  return labels[reason] ?? reason
}

function getDefaultRank(category: CategoryManagementItem) {
  if (category.archivedAt) return 2
  return 1
}

export function CustomCategoriesSection() {
  const queryClient = useQueryClient()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const isNarrow = useMediaQuery('(max-width: 36em)')
  const [filtersOpened, { close: closeFilters, toggle: toggleFilters }] =
    useDisclosure(false)
  const [archivedMode, setArchivedMode] = useState(false)
  const [primaryFilter, setPrimaryFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [rowSelection, setRowSelection] = useState<MRT_RowSelectionState>({})
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'category', desc: false },
  ])
  const [panel, setPanel] = useState<PanelState>(null)
  const [primary, setPrimary] = useState('')
  const [detailed, setDetailed] = useState('')
  const [description, setDescription] = useState('')
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
  const bulkUpdateCustom = useCategoryControllerBulkUpdateCustom({
    mutation: {
      onSuccess: (result) => {
        setLastBulkResult(result.skipped.length > 0 ? result : null)
        setRowSelection({})
        showSkippedNotification(result)
        invalidateCategoryConsumers(queryClient)
      },
    },
  })

  useEffect(() => {
    setRowSelection({})
    setPanel(null)
    setLastBulkResult(null)
  }, [archivedMode, primaryFilter, search])

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
  const detailedOptions = useMemo(
    () =>
      Array.from(
        new Map(
          categories.map((category) => [
            normalizeCategoryLabel(getDetailedDisplay(category)),
            getDetailedDisplay(category),
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
        if (
          panel?.mode === 'edit-custom' &&
          panel.category?.id === category.id
        ) {
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

    return categories.filter((category) => {
      if (!archivedMode && category.archivedAt) return false

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
        getStatus(category),
      ].some((value) =>
        normalizeCategoryLabel(value).includes(normalizedSearch),
      )
    })
  }, [archivedMode, categories, primaryFilter, search])

  const sortedCategories = useMemo(() => {
    const activeSort = sorting.at(0)
    const sorted = [...filteredCategories]

    sorted.sort((left, right) => {
      let result =
        getDefaultRank(left) - getDefaultRank(right) ||
        getCategoryPairLabel(left).localeCompare(getCategoryPairLabel(right))

      if (activeSort?.id === 'status') {
        result = getStatus(left).localeCompare(getStatus(right))
      } else if (activeSort?.id === 'used') {
        result = (left.transactionCount ?? 0) - (right.transactionCount ?? 0)
      }

      return activeSort?.desc ? -result : result
    })

    return sorted
  }, [filteredCategories, sorting])

  const selectedIds = useMemo(
    () =>
      new Set(
        Object.entries(rowSelection)
          .filter(([, selected]) => selected)
          .map(([id]) => id),
      ),
    [rowSelection],
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
  const canArchive =
    selectedRows.length > 0 &&
    selectedRows.every((category) => !category.archivedAt)
  const canRestore =
    selectedRows.length > 0 &&
    selectedRows.every((category) => Boolean(category.archivedAt))
  const canDuplicate = canArchive
  const categoryColumnSize = isMobile ? 168 : 320
  const categoryColumnMinSize = isMobile ? 96 : 180
  const categoryColumnMaxSize = isMobile ? 220 : undefined
  const hiddenActiveFilterCount = [
    archivedMode ? 'archived' : null,
    primaryFilter,
  ].filter(Boolean).length
  const hasActiveFilters = hiddenActiveFilterCount > 0
  const filterButtonLabel =
    hiddenActiveFilterCount > 0
      ? `Open category filters, ${hiddenActiveFilterCount} active`
      : 'Open category filters'

  function openCreatePanel() {
    setPanel({ mode: 'create' })
    setPrimary('')
    setDetailed('')
    setDescription('')
  }

  function clearFilters() {
    setArchivedMode(false)
    setPrimaryFilter(null)
  }

  function openEditPanel(category: CategoryManagementItem) {
    setPanel({ mode: 'edit-custom', category })
    setPrimary(category.primary)
    setDetailed(category.detailed)
    setDescription(category.description)
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

  function archiveOrRestore(ids: Array<string>, action: 'archive' | 'restore') {
    bulkUpdateCustom.mutate({ data: { categoryIds: ids, action } })
  }

  function duplicateCategories(ids: Array<string>) {
    bulkUpdateCustom.mutate({ data: { categoryIds: ids, action: 'duplicate' } })
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

    if (conflict.archivedAt) {
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

    return null
  }

  function renderManagementConflictAction(category: CategoryManagementItem) {
    if (category.archivedAt) {
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

    return null
  }

  function renderBulkButton(
    label: string,
    enabled: boolean,
    tooltip: string,
    onClick: () => void,
    icon?: ReactNode,
  ) {
    return (
      <Tooltip label={enabled ? label : tooltip}>
        <span>
          {isNarrow && icon ? (
            <ActionIcon
              aria-label={label}
              size={40}
              variant="light"
              disabled={!enabled}
              onClick={onClick}
            >
              {icon}
            </ActionIcon>
          ) : (
            <Button
              size={isMobile ? 'sm' : 'compact-sm'}
              variant="light"
              disabled={!enabled}
              leftSection={icon}
              onClick={onClick}
            >
              {label}
            </Button>
          )}
        </span>
      </Tooltip>
    )
  }

  const primaryFilterData: Array<CategorySelectOption> = [
    {
      value: '',
      primary: 'All primary categories',
      secondary: 'Show every secondary category',
    },
    ...primaryOptions.map((option) => ({
      value: option,
      primary: option,
      secondary: 'All secondary categories',
    })),
  ]
  const filterPanel = (
    <Stack gap="md">
      <CategorySelect
        aria-label="Primary category"
        label="Primary category"
        value={primaryFilter}
        onChange={setPrimaryFilter}
        data={primaryFilterData}
        placeholder="Primary category"
        size="md"
      />
      <Checkbox
        label="Archived"
        checked={archivedMode}
        onChange={(event) => setArchivedMode(event.currentTarget.checked)}
        size={isMobile ? 'md' : 'sm'}
      />

      {hasActiveFilters ? (
        <>
          <Divider />
          <Button
            variant="subtle"
            size={isMobile ? 'md' : 'xs'}
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        </>
      ) : null}
    </Stack>
  )
  const panelTitle =
    panel?.mode === 'create'
      ? 'New category'
      : panel?.mode === 'edit-custom'
        ? 'Edit category'
        : 'Category details'
  const panelBody = panel ? (
    panel.mode === 'view-archived' ? (
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
        <Autocomplete
          label="Primary category"
          value={primary}
          onChange={setPrimary}
          data={primaryOptions}
          data-testid="custom-category-primary-input"
          placeholder="Primary category"
          clearable
          clearButtonProps={{ 'aria-label': 'Clear primary category' }}
          size={isMobile ? 'md' : undefined}
        />
        <Autocomplete
          label="Secondary category"
          value={detailed}
          onChange={setDetailed}
          data={detailedOptions}
          data-testid="custom-category-detailed-input"
          placeholder="Secondary category"
          clearable
          clearButtonProps={{ 'aria-label': 'Clear secondary category' }}
          size={isMobile ? 'md' : undefined}
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          minRows={3}
          size={isMobile ? 'md' : undefined}
        />
        {panel.mode === 'edit-custom' && (
          <Text size="xs" c="dimmed">
            Renaming a category updates existing transactions that use it.
          </Text>
        )}
        {formDuplicateConflict && (
          <Alert color="yellow" title="Duplicate detected">
            <Text size="sm">
              Category already exists:{' '}
              {
                getCategoryConflictFromManagementItem(formDuplicateConflict)
                  .label
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
            {renderConflictAction(createCategory.error ?? updateCategory.error)}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={() => setPanel(null)}>
            Cancel
          </Button>
          <Button
            leftSection={<Save size={16} />}
            onClick={submitCreateOrEdit}
            loading={createCategory.isPending || updateCategory.isPending}
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
    )
  ) : null

  function renderCategoryRowActions(category: CategoryManagementItem) {
    const isArchived = Boolean(category.archivedAt)

    return (
      <Group
        className={tableChrome.actions}
        gap={4}
        justify="flex-end"
        wrap="nowrap"
      >
        <Tooltip label="Details">
          <ActionIcon
            aria-label="View category details"
            variant="subtle"
            size={ACTION_ICON_SIZE}
            onClick={() =>
              !isArchived
                ? openEditPanel(category)
                : setPanel({
                    mode: 'view-archived',
                    category,
                  })
            }
          >
            {!isArchived ? <Pencil size={16} /> : <Info size={16} />}
          </ActionIcon>
        </Tooltip>
        {isArchived && (
          <Tooltip label="Restore category">
            <ActionIcon
              aria-label="Restore category"
              variant="subtle"
              size={ACTION_ICON_SIZE}
              onClick={() => archiveOrRestore([category.id], 'restore')}
            >
              <RotateCcw size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    )
  }

  const categoryColumns: Array<MRT_ColumnDef<CategoryManagementItem>> = [
    {
      id: 'category',
      header: 'Category',
      accessorFn: getCategoryPairLabel,
      size: categoryColumnSize,
      minSize: categoryColumnMinSize,
      maxSize: categoryColumnMaxSize,
      grow: true,
      Cell: ({ row }) => (
        <div style={categoryCellContentStyle}>
          <Text lh={1.25} size="sm" fw={600}>
            {getPrimaryDisplay(row.original)}
          </Text>
          <Text lh={1.25} size="xs" c="dimmed">
            {getDetailedDisplay(row.original)}
          </Text>
        </div>
      ),
    },
    {
      id: 'used',
      header: 'Used',
      accessorFn: (category) => category.transactionCount ?? 0,
      size: USED_COLUMN_WIDTH,
      minSize: USED_COLUMN_WIDTH,
      maxSize: USED_COLUMN_WIDTH,
      grow: false,
      Cell: ({ cell }) => cell.getValue<number>(),
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: getStatus,
      size: STATUS_COLUMN_WIDTH,
      minSize: STATUS_COLUMN_WIDTH,
      maxSize: STATUS_COLUMN_WIDTH,
      grow: false,
      mantineTableBodyCellProps: {
        style: tableClippedBodyCellStyle,
      },
      Cell: ({ row }) => {
        const status = getStatus(row.original)

        return (
          <Tooltip label={status}>
            <Badge
              size="sm"
              color={status === 'Active' ? 'green' : 'orange'}
              variant="light"
            >
              {status}
            </Badge>
          </Tooltip>
        )
      },
    },
  ]
  const categoryTable = useMantineReactTable({
    columns: categoryColumns,
    data: sortedCategories,
    getRowId: (row) => row.id,
    rowCount: filteredCategories.length,
    enablePagination: false,
    manualSorting: true,
    onSortingChange: setSorting,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    layoutMode: 'grid',
    enableRowSelection: true,
    enableSelectAll: true,
    selectAllMode: 'all',
    onRowSelectionChange: setRowSelection,
    enableRowActions: true,
    positionActionsColumn: 'last',
    renderRowActions: ({ row }) => renderCategoryRowActions(row.original),
    enableColumnPinning: true,
    enableGlobalFilter: false,
    enableColumnFilters: false,
    enableColumnActions: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableHiding: false,
    enableTopToolbar: false,
    enableBottomToolbar: false,
    enableStickyHeader: true,
    initialState: {
      density: 'xs',
      columnPinning: { right: ['mrt-row-actions'] },
    },
    state: {
      sorting,
      rowSelection,
    },
    displayColumnDefOptions: {
      'mrt-row-select': {
        size: SELECT_COLUMN_WIDTH,
        minSize: SELECT_COLUMN_WIDTH,
        maxSize: SELECT_COLUMN_WIDTH,
        enableResizing: false,
      },
      'mrt-row-actions': {
        header: '',
        size: ACTIONS_COLUMN_WIDTH,
        minSize: ACTIONS_COLUMN_WIDTH,
        maxSize: ACTIONS_COLUMN_WIDTH,
        enableResizing: false,
        grow: false,
        mantineTableHeadCellProps: {
          className: tableChrome.actionsHeader,
          style: tableActionsHeaderStyle,
        },
        mantineTableBodyCellProps: {
          className: tableChrome.actionsCell,
          style: tableActionsCellStyle,
        },
      },
    },
    mantineSelectAllCheckboxProps: {
      'aria-label': 'Select all matching categories',
    },
    mantineSelectCheckboxProps: ({ row }) => ({
      'aria-label': `Select ${getCategoryPairLabel(row.original)}`,
    }),
    mantineTableHeadCellProps: {
      style: tableHeaderCellStyle,
    },
    mantineTableBodyRowProps: {
      style: { height: VIRTUAL_ROW_HEIGHT },
    },
    mantineTableBodyCellProps: {
      style: tableBodyCellStyle,
    },
    mantineTableProps: {
      className: tableChrome.table,
    },
    mantineTableContainerProps: {
      style: {
        flex: '1 1 0',
        height: '100%',
        maxHeight: '100%',
        minHeight: 0,
        overflow: 'auto',
      },
    },
    mantinePaperProps: {
      withBorder: true,
      radius: 'md',
      style: {
        display: 'flex',
        flex: '1 1 0',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '100%',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
      },
    },
    renderEmptyRowsFallback: () => (
      <Text c="dimmed" size="sm" ta="center" py="lg">
        No categories match the current filters.
      </Text>
    ),
  })

  return (
    <Stack
      gap="md"
      data-testid="custom-categories-section"
      style={{ flex: '1 1 auto', minHeight: 0 }}
    >
      <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
        <Box style={{ flex: '1 1 260px' }}>
          <Text fw={700} size="lg">
            Categories
          </Text>
          <Text size="sm" c="dimmed">
            Manage categories used by transaction dropdowns.
          </Text>
        </Box>
        {selectedRows.length === 0 && (
          <Button
            leftSection={<Plus size={16} />}
            mih={isMobile ? 48 : undefined}
            onClick={openCreatePanel}
            size="md"
            style={{ flex: isMobile ? '1 1 100%' : undefined }}
          >
            New category
          </Button>
        )}
      </Group>

      <Group align="center" gap="xs" wrap={isMobile ? 'nowrap' : 'wrap'}>
        <TextInput
          aria-label="Search categories"
          placeholder="Search categories..."
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          size="md"
          style={{ flex: '1 1 240px', minWidth: 0 }}
        />
        {isMobile ? (
          <Box pos="relative">
            <ActionIcon
              aria-label={filterButtonLabel}
              variant={hiddenActiveFilterCount > 0 ? 'light' : 'default'}
              size={48}
              onClick={toggleFilters}
            >
              <Filter size={20} />
            </ActionIcon>
            {hiddenActiveFilterCount > 0 && (
              <Badge circle size="xs" pos="absolute" top={-6} right={-6}>
                {hiddenActiveFilterCount}
              </Badge>
            )}
          </Box>
        ) : (
          <>
            <Checkbox
              label="Archived"
              checked={archivedMode}
              onChange={(event) => setArchivedMode(event.currentTarget.checked)}
            />
            <CategorySelect
              aria-label="Primary category"
              value={primaryFilter}
              onChange={setPrimaryFilter}
              data={primaryFilterData}
              placeholder="Primary category"
              size="md"
              w={220}
            />
          </>
        )}
      </Group>

      <Drawer
        opened={Boolean(isMobile) && filtersOpened}
        onClose={closeFilters}
        title="Filters"
        position="bottom"
        size="auto"
        padding="md"
      >
        {filterPanel}
      </Drawer>

      {selectedRows.length > 0 && (
        <Paper withBorder px="sm" py={6} radius="md">
          <Group
            gap={6}
            justify="space-between"
            wrap={isMobile ? 'wrap' : 'nowrap'}
          >
            <Text size="sm" fw={600}>
              {selectedRows.length} selected
            </Text>
            <Group
              gap={6}
              wrap="wrap"
              justify={isMobile ? 'flex-start' : 'flex-end'}
            >
              {canArchive &&
                renderBulkButton(
                  'Archive',
                  true,
                  'Select active categories.',
                  () =>
                    archiveOrRestore(
                      selectedRows.map((category) => category.id),
                      'archive',
                    ),
                  <Archive size={14} />,
                )}
              {canRestore &&
                renderBulkButton(
                  'Restore',
                  true,
                  'Select archived categories.',
                  () =>
                    archiveOrRestore(
                      selectedRows.map((category) => category.id),
                      'restore',
                    ),
                  <RotateCcw size={14} />,
                )}
              {!archivedMode && (
                <>
                  {renderBulkButton(
                    'Duplicate',
                    canDuplicate,
                    'Select active categories.',
                    () =>
                      duplicateCategories(
                        selectedRows.map((category) => category.id),
                      ),
                    <Copy size={14} />,
                  )}
                </>
              )}
            </Group>
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
        <Group
          align="stretch"
          gap="md"
          wrap="nowrap"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflow: 'hidden',
            width: '100%',
          }}
        >
          <MantineReactTable table={categoryTable} />

          {!isMobile && panel && (
            <Paper withBorder radius="md" p="md" w={340}>
              <Group justify="space-between" mb="sm">
                <Text fw={700}>{panelTitle}</Text>
                <ActionIcon
                  aria-label="Close category panel"
                  variant="subtle"
                  onClick={() => setPanel(null)}
                >
                  <X size={16} />
                </ActionIcon>
              </Group>
              {panelBody}
            </Paper>
          )}
        </Group>
      )}
      <Drawer
        opened={Boolean(isMobile && panel)}
        onClose={() => setPanel(null)}
        title={panelTitle}
        position="bottom"
        size="auto"
        padding="md"
      >
        {panelBody}
      </Drawer>
    </Stack>
  )
}
