import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, CircleHelp, Pencil, Plus, RotateCcw, Save } from 'lucide-react'
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table'
import { useMemo, useState } from 'react'
import {
  useAnalysisRuleControllerCreate,
  useAnalysisRuleControllerFindAll,
  useAnalysisRuleControllerUpdate,
  useCategoryControllerFindManagement,
} from '../../api/clients/spliceAPI'
import { CategoryScopeInput } from '../categories/CategoryScopeInput'
import tableChrome from '../MantineTableChrome.module.css'
import type { MRT_ColumnDef } from 'mantine-react-table'
import type {
  AnalysisCategoryScope,
  AnalysisCategoryScopeView,
  AnalysisRuleCategoryView,
  AnalysisRuleView,
  CategoryManagementItem,
  CreateAnalysisRuleDto,
} from '../../api/models'

type PanelState =
  | { mode: 'create'; rule?: undefined }
  | { mode: 'edit'; rule: AnalysisRuleItem }
  | null

type AnalysisRuleScopeView = AnalysisCategoryScopeView | null | undefined

type AnalysisRuleItem = Omit<
  AnalysisRuleView,
  'excludeScope' | 'inflowScope' | 'outflowScope'
> & {
  excludeScope?: AnalysisRuleScopeView
  inflowScope?: AnalysisRuleScopeView
  outflowScope?: AnalysisRuleScopeView
}

type RuleConflict = {
  ruleId: string
  name: string
  type: 'exclude' | 'neutralize'
  label: string
  archivedAt?: string | null
}

const emptySelectedScope: AnalysisCategoryScope = {
  mode: 'selected',
  categoryIds: [],
  includeUncategorized: false,
}

function scopeFromView(
  scope: AnalysisCategoryScopeView | null | undefined,
): AnalysisCategoryScope {
  if (!scope || scope.mode === 'all') {
    return { mode: 'all' }
  }

  return {
    mode: 'selected',
    categoryIds: scope.categories.map((category) => category.id),
    includeUncategorized: scope.includeUncategorized,
  }
}

function isScopeValid(scope: AnalysisCategoryScope) {
  return (
    scope.mode === 'all' ||
    (scope.categoryIds?.length ?? 0) > 0 ||
    Boolean(scope.includeUncategorized)
  )
}

function getRuleStatus(rule: AnalysisRuleItem) {
  return rule.archivedAt ? 'Archived' : 'Active'
}

function getRuleTypeLabel(type: AnalysisRuleView['type']) {
  return type === 'exclude' ? 'Exclude' : 'Neutralize'
}

function getScopeSummary(scope: AnalysisCategoryScopeView | null | undefined) {
  if (!scope) {
    return 'Not configured'
  }

  if (scope.mode === 'all') {
    return 'All categories'
  }

  const categoryLabels = scope.categories.map(
    (category) => `${category.detailed} (${category.primary})`,
  )
  const labels = [
    ...categoryLabels,
    ...(scope.includeUncategorized ? ['Uncategorized'] : []),
  ]

  if (labels.length === 0) {
    return 'No categories'
  }

  if (labels.length <= 3) {
    return labels.join(', ')
  }

  return `${labels.slice(0, 3).join(', ')} +${labels.length - 3} more`
}

function getRuleScopeSummary(rule: AnalysisRuleItem) {
  if (rule.type === 'exclude') {
    return getScopeSummary(rule.excludeScope)
  }

  return `${getScopeSummary(rule.inflowScope)} -> ${getScopeSummary(
    rule.outflowScope,
  )}`
}

function getRuleConflict(error: unknown): RuleConflict | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const response = (error as { response?: { data?: unknown } }).response
  const data = response?.data
  if (typeof data !== 'object' || data === null) {
    return null
  }

  const rule = (data as { rule?: unknown }).rule
  if (typeof rule !== 'object' || rule === null) {
    return null
  }

  return rule as RuleConflict
}

function getRuleErrorMessage(error: unknown) {
  const conflict = getRuleConflict(error)
  if (conflict) {
    return `Analysis rule already exists: ${conflict.label}`
  }

  return 'Failed to save analysis rule'
}

function invalidateAnalysisRuleConsumers(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      typeof query.queryKey[0] === 'string' &&
      (query.queryKey[0].includes('/analysis-rules') ||
        query.queryKey[0].includes('/transaction-analysis')),
  })
}

function collectRuleCategories(
  rule: AnalysisRuleItem,
): Array<AnalysisRuleCategoryView> {
  return [
    ...(rule.excludeScope?.mode === 'selected'
      ? rule.excludeScope.categories
      : []),
    ...(rule.inflowScope?.mode === 'selected'
      ? rule.inflowScope.categories
      : []),
    ...(rule.outflowScope?.mode === 'selected'
      ? rule.outflowScope.categories
      : []),
  ]
}

export function AnalysisRulesSection() {
  const queryClient = useQueryClient()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [archivedMode, setArchivedMode] = useState(false)
  const [search, setSearch] = useState('')
  const [panel, setPanel] = useState<PanelState>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<'exclude' | 'neutralize'>('exclude')
  const [excludeScope, setExcludeScope] =
    useState<AnalysisCategoryScope>(emptySelectedScope)
  const [inflowScope, setInflowScope] =
    useState<AnalysisCategoryScope>(emptySelectedScope)
  const [outflowScope, setOutflowScope] =
    useState<AnalysisCategoryScope>(emptySelectedScope)

  const {
    data: rules = [],
    isLoading,
    isError,
  } = useAnalysisRuleControllerFindAll({ archived: archivedMode })
  const { data: activeCategories = [] } = useCategoryControllerFindManagement({
    archived: false,
  })
  const { data: archivedCategories = [] } = useCategoryControllerFindManagement(
    { archived: true },
  )
  const ruleItems = useMemo(() => rules as Array<AnalysisRuleItem>, [rules])

  const createRule = useAnalysisRuleControllerCreate<unknown>({
    mutation: {
      onSuccess: () => {
        setPanel(null)
        invalidateAnalysisRuleConsumers(queryClient)
      },
    },
  })
  const updateRule = useAnalysisRuleControllerUpdate<unknown>({
    mutation: {
      onSuccess: () => {
        setPanel(null)
        invalidateAnalysisRuleConsumers(queryClient)
      },
    },
  })

  const categories = useMemo(() => {
    const categoriesById = new Map<string, CategoryManagementItem>()
    ;[...activeCategories, ...archivedCategories].forEach((category) => {
      categoriesById.set(category.id, category)
    })

    return Array.from(categoriesById.values()).sort((left, right) =>
      `${left.primary}:${left.detailed}`.localeCompare(
        `${right.primary}:${right.detailed}`,
      ),
    )
  }, [activeCategories, archivedCategories])

  const filteredRules = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) {
      return ruleItems
    }

    return ruleItems.filter((rule) =>
      [rule.name, getRuleTypeLabel(rule.type), getRuleScopeSummary(rule)]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [ruleItems, search])

  const panelCategories = useMemo(() => {
    if (!panel?.rule) {
      return categories.filter((category) => !category.archivedAt)
    }

    const categoriesById = new Map(
      categories.map((category) => [category.id, category]),
    )
    collectRuleCategories(panel.rule).forEach((category) => {
      if (!categoriesById.has(category.id)) {
        categoriesById.set(category.id, category as CategoryManagementItem)
      }
    })

    return Array.from(categoriesById.values())
  }, [categories, panel])

  function resetFormForCreate() {
    setPanel({ mode: 'create' })
    setName('')
    setType('exclude')
    setExcludeScope(emptySelectedScope)
    setInflowScope(emptySelectedScope)
    setOutflowScope(emptySelectedScope)
  }

  function openEditPanel(rule: AnalysisRuleItem) {
    setPanel({ mode: 'edit', rule })
    setName(rule.name)
    setType(rule.type)
    setExcludeScope(scopeFromView(rule.excludeScope))
    setInflowScope(scopeFromView(rule.inflowScope))
    setOutflowScope(scopeFromView(rule.outflowScope))
  }

  function buildSubmitDto(): CreateAnalysisRuleDto | null {
    const cleanedName = name.trim()
    if (!cleanedName) {
      return null
    }

    if (type === 'exclude') {
      if (!isScopeValid(excludeScope)) {
        return null
      }

      return {
        name: cleanedName,
        type,
        excludeScope,
      }
    }

    if (!isScopeValid(inflowScope) || !isScopeValid(outflowScope)) {
      return null
    }

    return {
      name: cleanedName,
      type,
      inflowScope,
      outflowScope,
    }
  }

  function submitRule() {
    const dto = buildSubmitDto()
    if (!dto) {
      return
    }

    if (panel?.mode === 'edit') {
      updateRule.mutate({ id: panel.rule.id, data: dto })
      return
    }

    createRule.mutate({ data: dto })
  }

  function archiveOrRestore(rule: AnalysisRuleItem, archived: boolean) {
    updateRule.mutate({ id: rule.id, data: { archived } })
    if (!archived) {
      setArchivedMode(false)
    }
  }

  function restoreConflictRule(ruleId: string) {
    updateRule.mutate({ id: ruleId, data: { archived: false } })
    setArchivedMode(false)
  }

  const activeError = createRule.error ?? updateRule.error
  const conflict = getRuleConflict(activeError)
  const submitDisabled = buildSubmitDto() === null
  const drawerControlSize = isMobile ? 'md' : undefined

  const columns: Array<MRT_ColumnDef<AnalysisRuleItem>> = [
    {
      accessorKey: 'name',
      header: 'Name',
      minSize: 180,
      Cell: ({ row }) => (
        <Box>
          <Text fw={600} size="sm">
            {row.original.name}
          </Text>
          <Text size="xs" c="dimmed" hiddenFrom="sm">
            {getRuleScopeSummary(row.original)}
          </Text>
        </Box>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      accessorFn: (rule) => getRuleTypeLabel(rule.type),
      size: 120,
      Cell: ({ row }) => (
        <Badge
          variant="light"
          color={row.original.type === 'exclude' ? 'red' : 'blue'}
        >
          {getRuleTypeLabel(row.original.type)}
        </Badge>
      ),
    },
    {
      id: 'scope',
      header: 'Scope',
      accessorFn: getRuleScopeSummary,
      minSize: 260,
      Cell: ({ row }) => (
        <Text size="sm" lineClamp={2}>
          {getRuleScopeSummary(row.original)}
        </Text>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: getRuleStatus,
      size: 110,
      Cell: ({ row }) => {
        const status = getRuleStatus(row.original)
        return (
          <Badge
            color={status === 'Active' ? 'green' : 'orange'}
            variant="light"
          >
            {status}
          </Badge>
        )
      },
    },
  ]

  const table = useMantineReactTable({
    columns,
    data: filteredRules,
    getRowId: (row) => row.id,
    enablePagination: false,
    enableRowActions: true,
    positionActionsColumn: 'last',
    enableColumnActions: false,
    enableColumnFilters: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableGlobalFilter: false,
    enableHiding: false,
    enableTopToolbar: false,
    enableBottomToolbar: false,
    initialState: { density: 'xs' },
    mantineTableProps: {
      className: tableChrome.table,
    },
    mantinePaperProps: {
      withBorder: true,
      radius: 'md',
    },
    renderRowActions: ({ row }) => (
      <Group gap={4} justify="flex-end" wrap="nowrap">
        <Tooltip label="Edit rule">
          <ActionIcon
            aria-label="Edit rule"
            variant="subtle"
            onClick={() => openEditPanel(row.original)}
          >
            <Pencil size={16} />
          </ActionIcon>
        </Tooltip>
        {row.original.archivedAt ? (
          <Tooltip label="Restore rule">
            <ActionIcon
              aria-label="Restore rule"
              variant="subtle"
              onClick={() => archiveOrRestore(row.original, false)}
            >
              <RotateCcw size={16} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Tooltip label="Archive rule">
            <ActionIcon
              aria-label="Archive rule"
              variant="subtle"
              onClick={() => archiveOrRestore(row.original, true)}
            >
              <Archive size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    ),
    renderEmptyRowsFallback: () => (
      <Text c="dimmed" size="sm" ta="center" py="lg">
        No analysis rules match the current filters.
      </Text>
    ),
  })

  return (
    <Stack gap="md" data-testid="analysis-rules-section">
      <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
        <Box style={{ flex: '1 1 260px' }}>
          <Text fw={700} size="lg">
            Analysis rules
          </Text>
          <Text size="sm" c="dimmed">
            Rules apply to the selected analysis date range and future analysis
            callers automatically.
          </Text>
        </Box>
        <Button
          leftSection={<Plus size={16} />}
          onClick={resetFormForCreate}
          mih={isMobile ? 48 : undefined}
          size="md"
          style={{ flex: isMobile ? '1 1 100%' : undefined }}
        >
          New rule
        </Button>
      </Group>

      <Group gap="xs" wrap={isMobile ? 'wrap' : 'nowrap'}>
        <TextInput
          aria-label="Search analysis rules"
          placeholder="Search rules..."
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          size="md"
          style={{ flex: '1 1 240px', minWidth: 0 }}
        />
        <Button
          variant={archivedMode ? 'light' : 'default'}
          onClick={() => setArchivedMode((value) => !value)}
          mih={isMobile ? 48 : undefined}
          size="md"
        >
          Archived
        </Button>
      </Group>

      {isLoading && (
        <Group justify="center" py="lg">
          <Loader />
        </Group>
      )}

      {isError && (
        <Alert color="red" title="Error">
          Failed to load analysis rules
        </Alert>
      )}

      {!isLoading && !isError && <MantineReactTable table={table} />}

      <Drawer
        opened={panel !== null}
        onClose={() => setPanel(null)}
        title={
          panel?.mode === 'edit' ? 'Edit analysis rule' : 'New analysis rule'
        }
        position={isMobile ? 'bottom' : 'right'}
        size={isMobile ? 'min(92dvh, 720px)' : 520}
        padding="md"
      >
        <Stack gap="md">
          <TextInput
            label="Name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            maxLength={80}
            size={drawerControlSize}
            required
          />
          <Select
            label="Type"
            value={type}
            size={drawerControlSize}
            onChange={(value) =>
              value && setType(value as 'exclude' | 'neutralize')
            }
            data={[
              { value: 'exclude', label: 'Exclude' },
              { value: 'neutralize', label: 'Neutralize' },
            ]}
            allowDeselect={false}
          />

          {type === 'exclude' ? (
            <CategoryScopeInput
              label="Excluded categories"
              value={excludeScope}
              onChange={setExcludeScope}
              categories={panelCategories}
              size={drawerControlSize}
            />
          ) : (
            <>
              <CategoryScopeInput
                label="Inflows"
                value={inflowScope}
                onChange={setInflowScope}
                categories={panelCategories}
                size={drawerControlSize}
              />
              <CategoryScopeInput
                label="Outflows"
                value={outflowScope}
                onChange={setOutflowScope}
                categories={panelCategories}
                size={drawerControlSize}
              />
            </>
          )}

          {(createRule.isError || updateRule.isError) && (
            <Alert color="yellow" title="Duplicate detected">
              <Text size="sm">{getRuleErrorMessage(activeError)}</Text>
              {conflict?.archivedAt && (
                <Button
                  size="xs"
                  variant="light"
                  mt="xs"
                  onClick={() => restoreConflictRule(conflict.ruleId)}
                >
                  Restore existing rule
                </Button>
              )}
            </Alert>
          )}

          <Paper withBorder p="sm" radius="md">
            <Group gap={6} wrap="nowrap">
              <Text size="sm" fw={600}>
                Summary
              </Text>
              {type === 'neutralize' && (
                <Tooltip
                  label="Exact same currency and smallest-unit amount. Outflows match oldest first; closest-date inflow wins, then oldest/id."
                  multiline
                  w={260}
                >
                  <ActionIcon
                    aria-label="Neutralize tie breaking rules"
                    size="xs"
                    variant="subtle"
                  >
                    <CircleHelp size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              {type === 'exclude'
                ? getScopeSummary(
                    excludeScope.mode === 'all'
                      ? { mode: 'all' }
                      : {
                          mode: 'selected',
                          includeUncategorized:
                            excludeScope.includeUncategorized ?? false,
                          categories: panelCategories.filter((category) =>
                            (excludeScope.categoryIds ?? []).includes(
                              category.id,
                            ),
                          ),
                        },
                  )
                : 'Inflows matching the first scope may cancel outflows matching the second scope.'}
            </Text>
          </Paper>

          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => setPanel(null)}
              size={drawerControlSize}
            >
              Cancel
            </Button>
            <Button
              leftSection={<Save size={16} />}
              onClick={submitRule}
              loading={createRule.isPending || updateRule.isPending}
              disabled={submitDisabled}
              size={drawerControlSize}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Drawer>
    </Stack>
  )
}
