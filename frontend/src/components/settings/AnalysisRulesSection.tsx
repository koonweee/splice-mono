import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, CircleHelp, Pencil, RotateCcw, Save } from 'lucide-react'
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table'
import { useMemo, useState } from 'react'
import { invalidateMutationFamilies } from '../../lib/query-invalidation'
import { useCompactLayout } from '../../lib/responsive'
import { DataState } from '../DataState'
import {
  useAnalysisRuleControllerCreate,
  useAnalysisRuleControllerFindAll,
  useAnalysisRuleControllerUpdate,
  useCategoryControllerFindManagement,
} from '../../api/clients/spliceAPI'
import { CategoryScopeInput } from '../categories/CategoryScopeInput'
import { EditorModal } from '../forms/EditorModal'
import { FormActions } from '../forms/FormActions'
import { MobileTableList } from '../MobileTableList'
import tableChrome from '../MantineTableChrome.module.css'
import { SettingsArchiveFilter } from './SettingsArchiveFilter'
import { SettingsStatusBadge } from './SettingsStatusBadge'
import { SettingsToolbar } from './SettingsToolbar'
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
  | { mode: 'edit-lookaround'; rule?: undefined }
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

export type AnalysisLookaroundSettingConnector = {
  value?: number
  isSaving?: boolean
  onSave?: (days: number) => void | Promise<void>
}

type AnalysisRulesSectionProps = {
  lookaroundSetting?: AnalysisLookaroundSettingConnector
}

type LookaroundRuleItem = {
  itemType: 'lookaround'
  id: 'neutralization-lookaround'
  lookaroundDays: number
}

type AnalysisRuleTableItem =
  | (AnalysisRuleItem & { itemType: 'rule' })
  | LookaroundRuleItem

const emptySelectedScope: AnalysisCategoryScope = {
  mode: 'selected',
  categoryIds: [],
  includeUncategorized: false,
}

const DEFAULT_LOOKAROUND_DAYS = 60
const MIN_LOOKAROUND_DAYS = 0
const MAX_LOOKAROUND_DAYS = 180

function isLookaroundItem(
  item: AnalysisRuleTableItem,
): item is LookaroundRuleItem {
  return item.itemType === 'lookaround'
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
  return type === 'exclude' ? 'Exclude' : 'Match and offset'
}

function getItemTypeLabel(item: AnalysisRuleTableItem) {
  return isLookaroundItem(item) ? 'Setting' : getRuleTypeLabel(item.type)
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
    return `When a transaction is in ${getScopeSummary(rule.excludeScope)}, exclude it from analysis.`
  }

  return `When money in for ${getScopeSummary(rule.inflowScope)} matches money out for ${getScopeSummary(rule.outflowScope)}, exclude both from analysis.`
}

function getLookaroundScopeSummary(days: number) {
  if (days === 0) return 'Match only within the selected date range.'
  return `Match up to ${days} ${days === 1 ? 'day' : 'days'} before or after the selected date range.`
}

function getItemScopeSummary(item: AnalysisRuleTableItem) {
  return isLookaroundItem(item)
    ? getLookaroundScopeSummary(item.lookaroundDays)
    : getRuleScopeSummary(item)
}

function getItemStatus(item: AnalysisRuleTableItem) {
  return isLookaroundItem(item) ? 'Active' : getRuleStatus(item)
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
  void invalidateMutationFamilies(queryClient, [
    'analysisRules',
    'analysis',
    'user',
  ])
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

export function AnalysisRulesSection({
  lookaroundSetting,
}: AnalysisRulesSectionProps = {}) {
  const queryClient = useQueryClient()
  const isMobile = useCompactLayout()
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
  const [lookaroundDays, setLookaroundDays] = useState<string | number>(
    DEFAULT_LOOKAROUND_DAYS,
  )
  const [lookaroundError, setLookaroundError] = useState<string | null>(null)

  const {
    data: rules = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useAnalysisRuleControllerFindAll({ archived: archivedMode })
  const { data: activeCategories = [] } = useCategoryControllerFindManagement({
    archived: false,
  })
  const { data: archivedCategories = [] } = useCategoryControllerFindManagement(
    { archived: true },
  )
  const ruleItems = useMemo(() => rules as Array<AnalysisRuleItem>, [rules])
  const lookaroundItem = useMemo<LookaroundRuleItem>(
    () => ({
      itemType: 'lookaround',
      id: 'neutralization-lookaround',
      lookaroundDays:
        lookaroundSetting?.value == null
          ? DEFAULT_LOOKAROUND_DAYS
          : lookaroundSetting.value,
    }),
    [lookaroundSetting?.value],
  )
  const tableItems = useMemo<Array<AnalysisRuleTableItem>>(
    () => [
      ...(archivedMode ? [] : [lookaroundItem]),
      ...ruleItems.map((rule) => ({ ...rule, itemType: 'rule' as const })),
    ],
    [archivedMode, lookaroundItem, ruleItems],
  )

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
      return tableItems
    }

    return tableItems.filter((item) =>
      [
        isLookaroundItem(item) ? 'Matching window' : item.name,
        getItemTypeLabel(item),
        getItemScopeSummary(item),
        getItemStatus(item),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [tableItems, search])

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

  function openLookaroundPanel() {
    setPanel({ mode: 'edit-lookaround' })
    setLookaroundDays(lookaroundItem.lookaroundDays)
    setLookaroundError(null)
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
    if (createRule.isPending || updateRule.isPending) return
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

  function getValidatedLookaroundDays() {
    if (String(lookaroundDays).trim() === '') return null
    const parsed =
      typeof lookaroundDays === 'number'
        ? lookaroundDays
        : Number(lookaroundDays)

    if (
      !Number.isInteger(parsed) ||
      parsed < MIN_LOOKAROUND_DAYS ||
      parsed > MAX_LOOKAROUND_DAYS
    ) {
      return null
    }

    return parsed
  }

  function submitLookaround() {
    if (lookaroundSetting?.isSaving) return
    const nextDays = getValidatedLookaroundDays()
    if (nextDays === null) {
      setLookaroundError('Enter a whole number from 0 to 180.')
      return
    }

    if (!lookaroundSetting?.onSave) {
      setLookaroundError(
        'The matching window setting is unavailable. Try again after updating Splice.',
      )
      return
    }

    Promise.resolve(lookaroundSetting.onSave(nextDays))
      .then(() => {
        setPanel(null)
        invalidateAnalysisRuleConsumers(queryClient)
      })
      .catch(() => {
        setLookaroundError('Failed to save matching window.')
      })
  }

  function renderRuleRowActions(item: AnalysisRuleTableItem) {
    if (isLookaroundItem(item)) {
      return (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Tooltip label="Edit setting">
            <ActionIcon
              aria-label="Edit matching window"
              size={isMobile ? 44 : 36}
              variant="subtle"
              onClick={openLookaroundPanel}
            >
              <Pencil size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )
    }

    return (
      <Group gap={4} justify="flex-end" wrap="nowrap">
        <Tooltip label="Edit rule">
          <ActionIcon
            aria-label="Edit rule"
            size={isMobile ? 44 : 36}
            variant="subtle"
            onClick={() => openEditPanel(item)}
          >
            <Pencil size={16} />
          </ActionIcon>
        </Tooltip>
        {item.archivedAt ? (
          <Tooltip label="Restore rule">
            <ActionIcon
              aria-label="Restore rule"
              size={isMobile ? 44 : 36}
              variant="subtle"
              onClick={() => archiveOrRestore(item, false)}
            >
              <RotateCcw size={16} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Tooltip label="Archive rule">
            <ActionIcon
              aria-label="Archive rule"
              size={isMobile ? 44 : 36}
              variant="subtle"
              onClick={() => archiveOrRestore(item, true)}
            >
              <Archive size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    )
  }

  function renderMobileRuleRow(item: AnalysisRuleTableItem) {
    return (
      <Stack px="sm" py="sm" gap="xs">
        <Text fw={700}>
          {isLookaroundItem(item) ? 'Matching window' : item.name}
        </Text>
        <Text c="dimmed" lineClamp={3} size="sm">
          {getItemScopeSummary(item)}
        </Text>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Group gap={6}>
            <SettingsStatusBadge status={getItemStatus(item)} />
            <Badge variant="light" size="sm" color="gray">
              {getItemTypeLabel(item)}
            </Badge>
          </Group>
          {renderRuleRowActions(item)}
        </Group>
      </Stack>
    )
  }

  const activeError = createRule.error ?? updateRule.error
  const conflict = getRuleConflict(activeError)
  const submitDisabled = buildSubmitDto() === null
  const editorControlSize = 'md'
  const editorTitle =
    panel?.mode === 'edit-lookaround'
      ? 'Edit matching window'
      : panel?.mode === 'edit'
        ? 'Edit analysis rule'
        : 'Add analysis rule'

  const columns: Array<MRT_ColumnDef<AnalysisRuleTableItem>> = [
    {
      accessorKey: 'name',
      header: 'Name',
      minSize: 180,
      Cell: ({ row }) => (
        <Box>
          <Text fw={600} size="sm">
            {isLookaroundItem(row.original)
              ? 'Matching window'
              : row.original.name}
          </Text>
          <Text size="xs" c="dimmed" hiddenFrom="sm">
            {getItemScopeSummary(row.original)}
          </Text>
        </Box>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      accessorFn: getItemTypeLabel,
      size: 120,
      Cell: ({ row }) => (
        <Badge
          variant="light"
          color={
            isLookaroundItem(row.original)
              ? 'gray'
              : row.original.type === 'exclude'
                ? 'red'
                : 'blue'
          }
        >
          {getItemTypeLabel(row.original)}
        </Badge>
      ),
    },
    {
      id: 'scope',
      header: 'Behavior',
      accessorFn: getItemScopeSummary,
      minSize: 260,
      Cell: ({ row }) => (
        <Text size="sm" lineClamp={2}>
          {getItemScopeSummary(row.original)}
        </Text>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorFn: getItemStatus,
      size: 110,
      Cell: ({ row }) => {
        const status = getItemStatus(row.original)
        return <SettingsStatusBadge status={status} />
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
    renderRowActions: ({ row }) => renderRuleRowActions(row.original),
    renderEmptyRowsFallback: () => (
      <Text c="dimmed" size="sm" ta="center" py="lg">
        No analysis rules match the current filters.
      </Text>
    ),
  })

  return (
    <Stack
      gap="md"
      data-testid="analysis-rules-section"
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: isMobile ? 'auto' : undefined,
      }}
    >
      <SettingsToolbar
        title="Analysis rules"
        description="Choose which transactions count toward your analysis totals."
        addLabel="Add rule"
        onAdd={resetFormForCreate}
      />

      <Group gap="xs" wrap={isMobile ? 'wrap' : 'nowrap'}>
        <TextInput
          aria-label="Search analysis rules"
          placeholder="Search rules..."
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          size="md"
          style={{ flex: '1 1 240px', minWidth: 0 }}
        />
        <SettingsArchiveFilter
          checked={archivedMode}
          onChange={setArchivedMode}
        />
      </Group>

      <DataState
        hasData={rules.length > 0}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        onRetry={() => void refetch()}
        loadingMessage="Loading analysis rules…"
        errorMessage="Failed to load analysis rules"
        emptyMessage="No analysis rules match the current filters."
      >
        {isMobile ? (
          <MobileTableList
            ariaLabel={`Analysis rules list, ${filteredRules.length.toLocaleString()} total`}
            data={filteredRules}
            emptyMessage="No analysis rules match the current filters."
            getRowKey={(rule) => rule.id}
            renderRow={renderMobileRuleRow}
          />
        ) : (
          <MantineReactTable table={table} />
        )}
      </DataState>

      <EditorModal
        opened={panel !== null}
        onClose={() => setPanel(null)}
        title={editorTitle}
        size="lg"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (panel?.mode === 'edit-lookaround') submitLookaround()
            else submitRule()
          }}
        >
          {panel?.mode === 'edit-lookaround' ? (
            <Stack gap="md">
              <NumberInput
                label="Days outside the date range"
                description="Include nearby transactions when matching refunds, reimbursements, or transfers."
                value={lookaroundDays}
                onChange={(value) => {
                  setLookaroundDays(value)
                  setLookaroundError(null)
                }}
                min={MIN_LOOKAROUND_DAYS}
                max={MAX_LOOKAROUND_DAYS}
                allowDecimal={false}
                clampBehavior="strict"
                size={editorControlSize}
                required
              />

              <Paper withBorder p="sm" radius="md">
                <Text size="sm" fw={600}>
                  Summary
                </Text>
                <Text size="sm" c="dimmed">
                  {getLookaroundScopeSummary(
                    getValidatedLookaroundDays() ??
                      lookaroundItem.lookaroundDays,
                  )}
                </Text>
              </Paper>

              {lookaroundError && (
                <Alert color="yellow" title="Unable to save">
                  {lookaroundError}
                </Alert>
              )}

              <FormActions
                onCancel={() => setPanel(null)}
                cancelDisabled={Boolean(lookaroundSetting?.isSaving)}
              >
                <Button
                  leftSection={<Save size={16} />}
                  type="submit"
                  loading={Boolean(lookaroundSetting?.isSaving)}
                  size={editorControlSize}
                >
                  Save
                </Button>
              </FormActions>
            </Stack>
          ) : (
            <Stack gap="md">
              <TextInput
                label="Name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={80}
                size={editorControlSize}
                required
              />
              <Select
                label="Effect"
                value={type}
                size={editorControlSize}
                onChange={(value) =>
                  value && setType(value as 'exclude' | 'neutralize')
                }
                data={[
                  { value: 'exclude', label: 'Exclude from analysis' },
                  { value: 'neutralize', label: 'Match money in and out' },
                ]}
                allowDeselect={false}
              />

              {type === 'exclude' ? (
                <CategoryScopeInput
                  label="Excluded categories"
                  value={excludeScope}
                  onChange={setExcludeScope}
                  categories={panelCategories}
                  size={editorControlSize}
                  viewportAwareDropdown={Boolean(isMobile)}
                />
              ) : (
                <>
                  <CategoryScopeInput
                    label="Money in"
                    value={inflowScope}
                    onChange={setInflowScope}
                    categories={panelCategories}
                    size={editorControlSize}
                    viewportAwareDropdown={Boolean(isMobile)}
                  />
                  <CategoryScopeInput
                    label="Money out"
                    value={outflowScope}
                    onChange={setOutflowScope}
                    categories={panelCategories}
                    size={editorControlSize}
                    viewportAwareDropdown={Boolean(isMobile)}
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
                      label="Matches must have the same amount and currency. Older payments are matched first, using the nearest matching money-in date."
                      multiline
                      w={260}
                    >
                      <ActionIcon
                        aria-label="How matching works"
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
                    ? `When a transaction is in ${getScopeSummary(
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
                      )}, exclude it from analysis.`
                    : 'When the selected money-in and money-out categories have matching amounts and currencies, exclude both transactions from analysis.'}
                </Text>
              </Paper>

              <FormActions
                onCancel={() => setPanel(null)}
                cancelDisabled={createRule.isPending || updateRule.isPending}
              >
                <Button
                  leftSection={<Save size={16} />}
                  type="submit"
                  loading={createRule.isPending || updateRule.isPending}
                  disabled={submitDisabled}
                  size={editorControlSize}
                >
                  Save
                </Button>
              </FormActions>
            </Stack>
          )}
        </form>
      </EditorModal>
    </Stack>
  )
}
