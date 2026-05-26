import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  ColorSwatch,
  Drawer,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Check,
  CircleHelp,
  Eye,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table'
import { useEffect, useMemo, useState } from 'react'
import {
  useAccountControllerFindAll,
  useCategorizationRuleControllerApply,
  useCategorizationRuleControllerCreate,
  useCategorizationRuleControllerFindAll,
  useCategorizationRuleControllerPreviewApplication,
  useCategorizationRuleControllerUpdate,
  useCategorizationRuleRecommendationControllerAccept,
  useCategorizationRuleRecommendationControllerDismiss,
  useCategorizationRuleRecommendationControllerGenerate,
  useCategorizationRuleRecommendationControllerList,
  useCategorizationRuleRecommendationControllerRegenerate,
  useCategoryControllerFindManagement,
} from '../../api/clients/spliceAPI'
import { CategorySelect } from '../categories/CategorySelect'
import { MobileTableList } from '../MobileTableList'
import tableChrome from '../MantineTableChrome.module.css'
import { TransactionsTable } from '../TransactionsTable'
import { TransactionsMobileList } from '../transactions/TransactionsMobileList'
import {
  TransactionConditionInput,
  getDefaultCategorizationCondition,
  toApiConditions,
} from './categorization/TransactionConditionInput'
import type { MRT_ColumnDef } from 'mantine-react-table'
import type {
  CategorizationRuleSuggestion,
  CategorizationRuleSuggestionGeneration,
  CategorizationRuleView,
  CategoryManagementItem,
  CreateCategorizationRuleDto,
  GenerateCategorizationRuleRecommendationsDto,
} from '../../api/models'
import type { CategorySelectOption } from '../categories/CategorySelect'
import type { EditableCategorizationCondition } from './categorization/TransactionConditionInput'

type PanelState =
  | { mode: 'create'; rule?: undefined }
  | { mode: 'edit'; rule: CategorizationRuleView }
  | null

type RuleConflict = {
  ruleId: string
  name: string
  label: string
  archivedAt?: string | null
}

function getCategoryLabel(category: { primary: string; detailed: string }) {
  return `${category.primary} / ${category.detailed}`
}

function getConditionLabel(condition: EditableCategorizationCondition) {
  const fieldLabels: Record<string, string> = {
    merchantName: 'Merchant',
    providerTransactionName: 'Provider name',
    originalDescription: 'Raw description',
    merchantEntityId: 'Merchant entity',
    website: 'Website',
    providerCategoryPrimary: 'Provider primary',
    providerCategoryDetailed: 'Provider detailed',
    accountId: 'Account',
    amountSign: 'Amount',
    amount: 'Amount',
  }
  const operatorLabels: Record<string, string> = {
    equals: 'is',
    contains: 'contains',
    startsWith: 'starts with',
    endsWith: 'ends with',
    in: 'is one of',
    greaterThan: 'is greater than',
    lessThan: 'is less than',
    between: 'is between',
  }

  if (condition.field === 'amountSign') {
    return `${fieldLabels[condition.field]} is ${
      condition.value === 'positive' ? 'inflow' : 'outflow'
    }`
  }

  if (condition.field === 'amount' && condition.operator === 'between') {
    const value =
      typeof condition.value === 'object' ? condition.value : { min: 0 }
    return `${fieldLabels[condition.field]} is between ${
      value.min ?? 'any'
    } and ${value.max ?? 'any'}`
  }

  const value = Array.isArray(condition.value)
    ? condition.value.join(', ')
    : String(condition.value)

  return `${fieldLabels[condition.field]} ${
    operatorLabels[condition.operator]
  } ${value || '...'}`
}

function conditionFromApi(
  condition: CategorizationRuleView['conditions'][number],
): EditableCategorizationCondition {
  return condition as EditableCategorizationCondition
}

function isConditionComplete(condition: EditableCategorizationCondition) {
  if (condition.field === 'amountSign') {
    return Boolean(condition.value)
  }

  if (condition.field === 'amount') {
    if (condition.operator === 'between') {
      return (
        typeof condition.value === 'object' &&
        (condition.value.min !== undefined || condition.value.max !== undefined)
      )
    }

    return typeof condition.value === 'number'
  }

  if (condition.field === 'accountId') {
    return Array.isArray(condition.value)
      ? condition.value.length > 0
      : condition.value.trim().length > 0
  }

  return condition.value.trim().length > 0
}

function getRuleStatus(rule: CategorizationRuleView) {
  return rule.archivedAt ? 'Archived' : 'Active'
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

function invalidateCategorizationConsumers(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      typeof query.queryKey[0] === 'string' &&
      (query.queryKey[0].includes('/categorization-rules') ||
        query.queryKey[0].includes('/categorization-rule-recommendations') ||
        query.queryKey[0].includes('/transaction') ||
        query.queryKey[0].includes('/category') ||
        query.queryKey[0].includes('/transaction-analysis')),
  })
}

function isRecommendationGenerationRunning(
  generation?: CategorizationRuleSuggestionGeneration | null,
) {
  return generation?.status === 'pending' || generation?.status === 'processing'
}

function getRecommendationRunDate(
  generation?: CategorizationRuleSuggestionGeneration | null,
) {
  return (
    generation?.completedAt ??
    generation?.failedAt ??
    generation?.startedAt ??
    generation?.createdAt ??
    null
  )
}

function formatRecommendationRunDate(
  generation?: CategorizationRuleSuggestionGeneration | null,
) {
  const value = getRecommendationRunDate(generation)
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function CategorizationRulesSection() {
  const queryClient = useQueryClient()
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [archivedMode, setArchivedMode] = useState(false)
  const [search, setSearch] = useState('')
  const [panel, setPanel] = useState<PanelState>(null)
  const [applyRule, setApplyRule] = useState<CategorizationRuleView | null>(
    null,
  )
  const [recommendationsOpen, setRecommendationsOpen] = useState(false)
  const [previewSuggestion, setPreviewSuggestion] =
    useState<CategorizationRuleSuggestion | null>(null)
  const [name, setName] = useState('')
  const [targetCategoryId, setTargetCategoryId] = useState<string | null>(null)
  const [priority, setPriority] = useState<string | number>(10)
  const [conditions, setConditions] = useState<
    Array<EditableCategorizationCondition>
  >([getDefaultCategorizationCondition()])
  const [applyResult, setApplyResult] = useState<{
    matched: number
    updated: number
    skippedManual: number
  } | null>(null)
  const [
    ignoredRecommendationCategoryIds,
    setIgnoredRecommendationCategoryIds,
  ] = useState<Array<string>>([])
  const [
    recommendationIgnoreCategoriesTouched,
    setRecommendationIgnoreCategoriesTouched,
  ] = useState(false)

  const {
    data: rules = [],
    isLoading,
    isError,
  } = useCategorizationRuleControllerFindAll({ archived: archivedMode })
  const { data: activeCategories = [] } = useCategoryControllerFindManagement({
    archived: false,
  })
  const { data: archivedCategories = [] } = useCategoryControllerFindManagement(
    { archived: true },
  )
  const { data: accounts = [] } = useAccountControllerFindAll()
  const recommendations = useCategorizationRuleRecommendationControllerList({
    query: {
      enabled: recommendationsOpen,
      refetchInterval: (query) => {
        if (!recommendationsOpen) {
          return false
        }

        const data = query.state.data
        return isRecommendationGenerationRunning(data?.generation)
          ? 3000
          : false
      },
    },
  })

  const createRule = useCategorizationRuleControllerCreate<unknown>({
    mutation: {
      onSuccess: () => {
        setPanel(null)
        invalidateCategorizationConsumers(queryClient)
      },
    },
  })
  const updateRule = useCategorizationRuleControllerUpdate<unknown>({
    mutation: {
      onSuccess: () => {
        setPanel(null)
        invalidateCategorizationConsumers(queryClient)
      },
    },
  })
  const applyMutation = useCategorizationRuleControllerApply<unknown>({
    mutation: {
      onSuccess: (result) => {
        setApplyResult(result)
        invalidateCategorizationConsumers(queryClient)
      },
    },
  })
  const generateRecommendations =
    useCategorizationRuleRecommendationControllerGenerate<unknown>({
      mutation: {
        onSuccess: () => {
          invalidateCategorizationConsumers(queryClient)
        },
      },
    })
  const regenerateRecommendations =
    useCategorizationRuleRecommendationControllerRegenerate<unknown>({
      mutation: {
        onSuccess: () => {
          invalidateCategorizationConsumers(queryClient)
        },
      },
    })
  const acceptRecommendation =
    useCategorizationRuleRecommendationControllerAccept<unknown>({
      mutation: {
        onSuccess: () => {
          setPreviewSuggestion(null)
          invalidateCategorizationConsumers(queryClient)
        },
      },
    })
  const dismissRecommendation =
    useCategorizationRuleRecommendationControllerDismiss<unknown>({
      mutation: {
        onSuccess: () => {
          invalidateCategorizationConsumers(queryClient)
        },
      },
    })
  const applicationPreview = useCategorizationRuleControllerPreviewApplication(
    applyRule?.id ?? '',
    {
      query: {
        enabled: applyRule !== null,
      },
    },
  )

  const categories = useMemo(() => {
    const categoriesById = new Map<string, CategoryManagementItem>()
    ;[...activeCategories, ...archivedCategories].forEach((category) => {
      categoriesById.set(category.id, category)
    })

    return Array.from(categoriesById.values()).sort((left, right) =>
      getCategoryLabel(left).localeCompare(getCategoryLabel(right)),
    )
  }, [activeCategories, archivedCategories])

  const categoryOptions = useMemo<Array<CategorySelectOption>>(
    () =>
      categories
        .filter((category) => !category.archivedAt)
        .map((category) => ({
          value: category.id,
          primary: category.primary,
          secondary: category.detailed,
          color: category.color,
        })),
    [categories],
  )

  const recommendationIgnoredCategoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: getCategoryLabel(category),
      })),
    [categories],
  )

  useEffect(() => {
    if (recommendationIgnoreCategoriesTouched) {
      return
    }

    const historicalCategory = categories.find(
      (category) =>
        category.primary.trim().toLowerCase() === 'others' &&
        category.detailed.trim().toLowerCase() === 'pre 2026',
    )
    if (historicalCategory) {
      if (
        ignoredRecommendationCategoryIds.length === 1 &&
        ignoredRecommendationCategoryIds[0] === historicalCategory.id
      ) {
        return
      }
      setIgnoredRecommendationCategoryIds([historicalCategory.id])
    }
  }, [
    categories,
    ignoredRecommendationCategoryIds,
    recommendationIgnoreCategoriesTouched,
  ])

  const filteredRules = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) {
      return rules
    }

    return rules.filter((rule) =>
      [
        rule.name,
        getCategoryLabel(rule.targetCategory),
        rule.conditions.map(conditionFromApi).map(getConditionLabel).join(' '),
        getRuleStatus(rule),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [rules, search])

  const activeError = createRule.error ?? updateRule.error
  const conflict = getRuleConflict(activeError)
  const drawerControlSize = isMobile ? 'md' : undefined

  function resetFormForCreate() {
    setPanel({ mode: 'create' })
    setName('')
    setTargetCategoryId(null)
    setPriority(10)
    setConditions([getDefaultCategorizationCondition()])
  }

  function openEditPanel(rule: CategorizationRuleView) {
    setPanel({ mode: 'edit', rule })
    setName(rule.name)
    setTargetCategoryId(rule.targetCategoryId)
    setPriority(rule.priority)
    setConditions(rule.conditions.map(conditionFromApi))
  }

  function buildSubmitDto(): CreateCategorizationRuleDto | null {
    const cleanedName = name.trim()
    const parsedPriority =
      typeof priority === 'number' ? priority : Number(priority)
    if (
      !cleanedName ||
      !targetCategoryId ||
      !Number.isInteger(parsedPriority) ||
      conditions.length === 0 ||
      !conditions.every(isConditionComplete)
    ) {
      return null
    }

    return {
      name: cleanedName,
      priority: parsedPriority,
      targetCategoryId,
      conditions: toApiConditions(conditions),
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

  function archiveOrRestore(rule: CategorizationRuleView, archived: boolean) {
    updateRule.mutate({ id: rule.id, data: { archived } })
    if (!archived) {
      setArchivedMode(false)
    }
  }

  function restoreConflictRule(ruleId: string) {
    updateRule.mutate({ id: ruleId, data: { archived: false } })
    setArchivedMode(false)
  }

  function openApply(rule: CategorizationRuleView) {
    setApplyRule(rule)
    setApplyResult(null)
  }

  function openRecommendations() {
    setRecommendationsOpen(true)
  }

  function closeRecommendations() {
    setRecommendationsOpen(false)
  }

  function buildRecommendationGenerationDto(): GenerateCategorizationRuleRecommendationsDto {
    return {
      ignoredCategoryIds: ignoredRecommendationCategoryIds,
    }
  }

  function generateRuleRecommendations() {
    generateRecommendations.mutate({ data: buildRecommendationGenerationDto() })
  }

  function regenerateRuleRecommendations() {
    regenerateRecommendations.mutate({
      data: buildRecommendationGenerationDto(),
    })
  }

  function openSuggestionForEdit(suggestion: CategorizationRuleSuggestion) {
    setRecommendationsOpen(false)
    setPanel({ mode: 'create' })
    setName(suggestion.name)
    setTargetCategoryId(suggestion.targetCategoryId)
    setPriority(suggestion.priority)
    setConditions(suggestion.conditions.map(conditionFromApi))
  }

  function renderCategoryLabel(category: {
    primary: string
    detailed: string
    color: string
  }) {
    return (
      <Group gap="xs" wrap="nowrap">
        <ColorSwatch
          color={category.color}
          size={14}
          withShadow={false}
        />
        <Text size="sm" lineClamp={1}>
          {getCategoryLabel(category)}
        </Text>
      </Group>
    )
  }

  function renderTargetCategory(rule: CategorizationRuleView) {
    return renderCategoryLabel(rule.targetCategory)
  }

  function renderConditionSummary(
    rule: Pick<CategorizationRuleView, 'conditions'>,
  ) {
    const labels = rule.conditions.map(conditionFromApi).map(getConditionLabel)

    return labels.join(' AND ')
  }

  function renderSuggestionCard(suggestion: CategorizationRuleSuggestion) {
    return (
      <Paper key={suggestion.id} withBorder p="sm" radius="md">
        <Group align="flex-start" gap="sm" justify="space-between" wrap="nowrap">
          <Box style={{ flex: '1 1 auto', minWidth: 0 }}>
            <Text fw={700} truncate>
              {suggestion.name}
            </Text>
            <Box mt={4}>{renderCategoryLabel(suggestion.targetCategory)}</Box>
            <Text c="dimmed" lineClamp={2} mt={6} size="sm">
              {renderConditionSummary(suggestion)}
            </Text>
            <Group gap="xs" mt={8}>
              <Badge variant="light">
                {suggestion.updated.toLocaleString()} updates
              </Badge>
              <Badge variant="light">
                {suggestion.manualConflicts.toLocaleString()} conflicts
              </Badge>
              <Badge variant="light">
                {suggestion.existingRuleOverlap.toLocaleString()} overlaps
              </Badge>
            </Group>
            {suggestion.rationale && (
              <Text c="dimmed" lineClamp={2} mt={6} size="xs">
                {suggestion.rationale}
              </Text>
            )}
          </Box>
          <Group gap={2} justify="flex-end" wrap="nowrap">
            <Tooltip label="Preview recommendation">
              <ActionIcon
                aria-label={`Preview recommendation ${suggestion.name}`}
                onClick={() => setPreviewSuggestion(suggestion)}
                variant="transparent"
              >
                <Eye size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Edit as rule">
              <ActionIcon
                aria-label={`Edit recommendation ${suggestion.name}`}
                onClick={() => openSuggestionForEdit(suggestion)}
                variant="transparent"
              >
                <Pencil size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Accept recommendation">
              <ActionIcon
                aria-label={`Accept recommendation ${suggestion.name}`}
                loading={acceptRecommendation.isPending}
                onClick={() =>
                  acceptRecommendation.mutate({ id: suggestion.id })
                }
                variant="transparent"
              >
                <Check size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Dismiss recommendation">
              <ActionIcon
                aria-label={`Dismiss recommendation ${suggestion.name}`}
                loading={dismissRecommendation.isPending}
                onClick={() =>
                  dismissRecommendation.mutate({ id: suggestion.id })
                }
                variant="transparent"
              >
                <Trash2 size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Paper>
    )
  }

  function renderRuleRowActions(rule: CategorizationRuleView) {
    return (
      <Group gap={4} justify="flex-end" wrap="nowrap">
        {!rule.archivedAt && (
          <Tooltip label="Apply to existing transactions">
            <ActionIcon
              aria-label="Apply rule to existing transactions"
              onClick={() => openApply(rule)}
              variant="subtle"
            >
              <Play size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="Edit rule">
          <ActionIcon
            aria-label="Edit rule"
            onClick={() => openEditPanel(rule)}
            variant="subtle"
          >
            <Pencil size={16} />
          </ActionIcon>
        </Tooltip>
        {rule.archivedAt ? (
          <Tooltip label="Restore rule">
            <ActionIcon
              aria-label="Restore rule"
              onClick={() => archiveOrRestore(rule, false)}
              variant="subtle"
            >
              <RotateCcw size={16} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Tooltip label="Archive rule">
            <ActionIcon
              aria-label="Archive rule"
              onClick={() => archiveOrRestore(rule, true)}
              variant="subtle"
            >
              <Archive size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    )
  }

  function renderMobileRuleRow(rule: CategorizationRuleView) {
    const status = getRuleStatus(rule)

    return (
      <Box px="sm" py="sm">
        <Group
          align="flex-start"
          justify="space-between"
          gap="sm"
          wrap="nowrap"
        >
          <Box style={{ flex: '1 1 auto', minWidth: 0 }}>
            <Text fw={700} truncate>
              {rule.name}
            </Text>
            <Group gap="xs" mt={4}>
              <Badge
                color={status === 'Active' ? 'green' : 'orange'}
                variant="light"
              >
                {status}
              </Badge>
              <Badge variant="light">Priority {rule.priority}</Badge>
            </Group>
            <Text c="dimmed" lineClamp={2} mt={6} size="sm">
              {renderConditionSummary(rule)}
            </Text>
            <Box mt={6}>{renderTargetCategory(rule)}</Box>
          </Box>
          {renderRuleRowActions(rule)}
        </Group>
      </Box>
    )
  }

  const columns: Array<MRT_ColumnDef<CategorizationRuleView>> = [
    {
      accessorKey: 'name',
      header: 'Name',
      minSize: 180,
      Cell: ({ row }) => (
        <Text fw={600} size="sm">
          {row.original.name}
        </Text>
      ),
    },
    {
      id: 'targetCategory',
      header: 'Target category',
      accessorFn: (rule) => getCategoryLabel(rule.targetCategory),
      minSize: 220,
      Cell: ({ row }) => renderTargetCategory(row.original),
    },
    {
      id: 'conditions',
      header: 'Conditions',
      accessorFn: renderConditionSummary,
      minSize: 280,
      Cell: ({ row }) => (
        <Text size="sm" lineClamp={2}>
          {renderConditionSummary(row.original)}
        </Text>
      ),
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      size: 100,
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
    renderRowActions: ({ row }) => renderRuleRowActions(row.original),
    renderEmptyRowsFallback: () => (
      <Text c="dimmed" size="sm" ta="center" py="lg">
        No categorization rules match the current filters.
      </Text>
    ),
  })

  const submitDisabled = buildSubmitDto() === null
  const drawerTitle =
    panel?.mode === 'edit'
      ? 'Edit categorization rule'
      : 'New categorization rule'
  const applicationCounts = applyResult ?? applicationPreview.data ?? null
  const recommendationSuggestions = recommendations.data?.suggestions ?? []
  const recommendationGeneration = recommendations.data?.generation
  const recommendationGenerationRunning =
    isRecommendationGenerationRunning(recommendationGeneration) ||
    generateRecommendations.isPending ||
    regenerateRecommendations.isPending
  const recommendationGenerationFailed =
    recommendationGeneration?.status === 'failed'
  const recommendationLastRun = formatRecommendationRunDate(
    recommendationGeneration,
  )
  const hasRecommendationRun = Boolean(recommendationGeneration)
  const recommendationError =
    recommendations.isError ||
    generateRecommendations.isError ||
    regenerateRecommendations.isError
  const suggestionPreviewCounts = previewSuggestion
    ? {
        matched: previewSuggestion.matched,
        updated: previewSuggestion.updated,
        skippedManual: previewSuggestion.skippedManual,
      }
    : null
  const updateCountLabel = applyResult ? 'Updated' : 'Would update'
  const applyButtonLabel =
    applicationPreview.data && !applyResult
      ? `Apply to ${applicationPreview.data.updated.toLocaleString()} transactions`
      : 'Apply rule'

  return (
    <Stack
      gap="md"
      data-testid="categorization-rules-section"
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: isMobile ? 'auto' : undefined,
      }}
    >
      <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
        <Box style={{ flex: '1 1 260px' }}>
          <Text fw={700} size="lg">
            Categorization rules
          </Text>
          <Text size="sm" c="dimmed">
            Rules set effective transaction categories during ingestion.
          </Text>
        </Box>
        <Group gap="xs" style={{ flex: isMobile ? '1 1 100%' : undefined }}>
          <Button
            leftSection={<Plus size={16} />}
            onClick={resetFormForCreate}
            mih={isMobile ? 48 : undefined}
            size="md"
            style={{ flex: isMobile ? '1 1 auto' : undefined }}
          >
            New rule
          </Button>
          <Tooltip label="Rule recommendations">
            <ActionIcon
              aria-label="Rule recommendations"
              loading={generateRecommendations.isPending}
              onClick={openRecommendations}
              size={isMobile ? 48 : 42}
              variant="filled"
            >
              <Sparkles size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Group gap="xs" wrap={isMobile ? 'wrap' : 'nowrap'}>
        <TextInput
          aria-label="Search categorization rules"
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Search rules..."
          size="md"
          style={{ flex: '1 1 240px', minWidth: 0 }}
          value={search}
        />
        <Button
          mih={isMobile ? 48 : undefined}
          onClick={() => setArchivedMode((value) => !value)}
          size="md"
          variant={archivedMode ? 'light' : 'default'}
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
          Failed to load categorization rules
        </Alert>
      )}

      {!isLoading &&
        !isError &&
        (isMobile ? (
          <MobileTableList
            ariaLabel={`Categorization rules list, ${filteredRules.length.toLocaleString()} total`}
            data={filteredRules}
            emptyMessage="No categorization rules match the current filters."
            getRowKey={(rule) => rule.id}
            renderRow={renderMobileRuleRow}
          />
        ) : (
          <MantineReactTable table={table} />
        ))}

      <Drawer
        opened={panel !== null}
        onClose={() => setPanel(null)}
        title={drawerTitle}
        position={isMobile ? 'bottom' : 'right'}
        size={isMobile ? 'min(92dvh, 760px)' : 640}
        padding="md"
      >
        <Stack gap="md">
          <TextInput
            label="Name"
            maxLength={80}
            onChange={(event) => setName(event.currentTarget.value)}
            required
            size={drawerControlSize}
            value={name}
          />
          <CategorySelect
            clearable={false}
            data={categoryOptions}
            label="Target category"
            onChange={setTargetCategoryId}
            placeholder="Select category"
            required
            size={drawerControlSize}
            value={targetCategoryId}
          />
          <NumberInput
            allowDecimal={false}
            label={
              <Group component="span" gap={6} wrap="nowrap">
                <span>Priority</span>
                <Tooltip
                  label="Lower numbers run first. If multiple rules match, the lowest priority wins; ties use older rules first."
                  multiline
                  w={260}
                >
                  <Box
                    aria-label="Priority help"
                    component="span"
                    style={{ display: 'inline-flex' }}
                  >
                    <CircleHelp size={14} />
                  </Box>
                </Tooltip>
              </Group>
            }
            onChange={setPriority}
            required
            size={drawerControlSize}
            value={priority}
          />

          <Stack gap="xs">
            <Text fw={600} size="sm">
              Conditions
            </Text>
            <TransactionConditionInput
              accounts={accounts}
              conditions={conditions}
              onChange={setConditions}
            />
          </Stack>

          {(createRule.isError || updateRule.isError) && (
            <Alert color="yellow" title="Duplicate detected">
              <Text size="sm">
                Categorization rule already exists
                {conflict ? `: ${conflict.label}` : '.'}
              </Text>
              {conflict?.archivedAt && (
                <Button
                  mt="xs"
                  onClick={() => restoreConflictRule(conflict.ruleId)}
                  size="xs"
                  variant="light"
                >
                  Restore existing rule
                </Button>
              )}
            </Alert>
          )}

          <Paper withBorder p="sm" radius="md">
            <Text size="sm" fw={600}>
              Summary
            </Text>
            <Text size="sm" c="dimmed">
              If {conditions.map(getConditionLabel).join(', and ')}, set
              category to{' '}
              {targetCategoryId
                ? getCategoryLabel(
                    categories.find(
                      (category) => category.id === targetCategoryId,
                    ) ?? { primary: 'Selected', detailed: 'category' },
                  )
                : 'the selected category'}
              .
            </Text>
          </Paper>

          <Group justify="flex-end">
            <Button
              onClick={() => setPanel(null)}
              size={drawerControlSize}
              variant="subtle"
            >
              Cancel
            </Button>
            <Button
              disabled={submitDisabled}
              leftSection={<Save size={16} />}
              loading={createRule.isPending || updateRule.isPending}
              onClick={submitRule}
              size={drawerControlSize}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Drawer>

      <Modal
        opened={applyRule !== null}
        onClose={() => setApplyRule(null)}
        title="Apply rule to existing transactions"
        size="xl"
      >
        {applyRule && (
          <Stack gap="md">
            <Paper withBorder p="sm" radius="md">
              <Text fw={700}>{applyRule.name}</Text>
              <Group gap="xs" mt={6}>
                <ColorSwatch
                  color={applyRule.targetCategory.color}
                  size={14}
                  withShadow={false}
                />
                <Text size="sm">
                  {getCategoryLabel(applyRule.targetCategory)}
                </Text>
              </Group>
              <Text c="dimmed" mt={6} size="sm">
                {renderConditionSummary(applyRule)}
              </Text>
            </Paper>

            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              {[
                ['Matched', applicationCounts?.matched],
                [updateCountLabel, applicationCounts?.updated],
                ['Skipped manual', applicationCounts?.skippedManual],
              ].map(([label, value]) => (
                <Paper key={label} withBorder p="sm" radius="md">
                  <Text c="dimmed" size="xs" tt="uppercase">
                    {label}
                  </Text>
                  <Text fw={800} size="xl">
                    {value ?? '-'}
                  </Text>
                </Paper>
              ))}
            </SimpleGrid>

            <Alert color="blue">Manual categories are never overwritten.</Alert>

            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={700} size="sm">
                  Transactions to update
                </Text>
                {applicationCounts && (
                  <Text c="dimmed" size="xs">
                    Most recent{' '}
                    {applicationPreview.data?.transactions.length ?? 0} of{' '}
                    {applicationCounts.updated.toLocaleString()}
                  </Text>
                )}
              </Group>
              {applicationPreview.isLoading && (
                <Group justify="center" py="md">
                  <Loader size="sm" />
                </Group>
              )}
              {!applicationPreview.isLoading &&
                applicationPreview.data &&
                applicationPreview.data.transactions.length === 0 && (
                  <Text c="dimmed" size="sm">
                    No eligible transactions to update.
                  </Text>
                )}
              {!applicationPreview.isLoading &&
                applicationPreview.data &&
                applicationPreview.data.transactions.length > 0 &&
                (isMobile ? (
                  <Box maw="100%" mah={360} style={{ overflowY: 'auto' }}>
                    <TransactionsMobileList
                      data={applicationPreview.data.transactions}
                      isError={false}
                      isLoading={false}
                      readOnly
                      totalRows={applicationPreview.data.transactions.length}
                      variant="drilldown"
                    />
                  </Box>
                ) : (
                  <TransactionsTable
                    data={applicationPreview.data.transactions}
                    hiddenColumns={['category']}
                    isError={false}
                    isLoading={false}
                    mantineTableContainerProps={{
                      style: { maxHeight: 360, overflowY: 'auto' },
                    }}
                    readOnly
                    totalRows={applicationPreview.data.transactions.length}
                  />
                ))}
            </Stack>

            {applicationPreview.isError && !applyResult && (
              <Alert color="red" title="Error">
                Failed to load rule preview
              </Alert>
            )}

            {applyMutation.isError && (
              <Alert color="red" title="Error">
                Failed to apply categorization rule
              </Alert>
            )}

            <Group justify="flex-end">
              <Button onClick={() => setApplyRule(null)} variant="subtle">
                Close
              </Button>
              <Button
                leftSection={<Play size={16} />}
                disabled={
                  !applyResult &&
                  (applicationPreview.isLoading || applicationPreview.isError)
                }
                loading={applyMutation.isPending || applicationPreview.isLoading}
                onClick={() => applyMutation.mutate({ id: applyRule.id })}
              >
                {applyButtonLabel}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Drawer
        opened={recommendationsOpen}
        onClose={closeRecommendations}
        title={
          <Group gap="xs" wrap="nowrap">
            <Sparkles size={18} />
            <Text fw={700}>Rule recommendations</Text>
          </Group>
        }
        position={isMobile ? 'bottom' : 'right'}
        size={isMobile ? 'min(92dvh, 760px)' : 560}
        padding="md"
      >
        <Stack gap="md">
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Box style={{ minWidth: 0 }}>
              <Text size="sm" c="dimmed">
                Based on your manually categorized transactions.
              </Text>
              {recommendationLastRun && (
                <Text size="sm" c="dimmed" mt={4}>
                  Last run {recommendationLastRun}.
                </Text>
              )}
              {recommendationGenerationRunning && (
                <Text size="sm" c="dimmed" mt={4}>
                  You can close this panel and come back later.
                </Text>
              )}
            </Box>
            <Tooltip label="Regenerate recommendations">
              <ActionIcon
                aria-label="Regenerate recommendations"
                disabled={recommendationGenerationRunning}
                loading={regenerateRecommendations.isPending}
                onClick={regenerateRuleRecommendations}
                variant="subtle"
              >
                <RefreshCw size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>

          <MultiSelect
            clearable
            data={recommendationIgnoredCategoryOptions}
            description="Excluded from manual-label learning and conflict checks for this run."
            disabled={recommendationGenerationRunning}
            label="Ignore labels from categories"
            onChange={(value) => {
              setRecommendationIgnoreCategoriesTouched(true)
              setIgnoredRecommendationCategoryIds(value)
            }}
            searchable
            value={ignoredRecommendationCategoryIds}
          />

          {recommendationError && (
            <Alert color="red" title="Unable to generate recommendations">
              Recommendation generation is not available right now.
            </Alert>
          )}

          {recommendationGenerationFailed && !recommendationError && (
            <Alert color="yellow" title="Generation failed">
              {recommendationGeneration.errorMessage ??
                'Try regenerating recommendations.'}
            </Alert>
          )}

          {recommendationGenerationRunning && (
            <Paper withBorder p="md" radius="md">
              <Group align="flex-start" gap="sm" wrap="nowrap">
                <Loader size="sm" />
                <Box>
                  <Text fw={700} size="sm">
                    Finding patterns in manual categories
                  </Text>
                  <Text c="dimmed" size="sm">
                    This may take a moment. You can leave and return later.
                  </Text>
                </Box>
              </Group>
            </Paper>
          )}

          {!recommendationGenerationRunning &&
            !recommendationGenerationFailed &&
            recommendationSuggestions.length === 0 && (
              <Paper withBorder p="md" radius="md">
                <Stack gap="sm">
                  <Text fw={700} size="sm">
                    {hasRecommendationRun
                      ? 'No recommendations found'
                      : 'No recommendations yet'}
                  </Text>
                  <Text c="dimmed" size="sm">
                    {hasRecommendationRun
                      ? 'The last run did not produce suggestions that passed validation.'
                      : 'Generate suggestions from transactions you categorized manually.'}
                  </Text>
                  <Button
                    leftSection={<Sparkles size={16} />}
                    onClick={() =>
                      hasRecommendationRun
                        ? regenerateRuleRecommendations()
                        : generateRuleRecommendations()
                    }
                    size="sm"
                  >
                    {hasRecommendationRun
                      ? 'Regenerate recommendations'
                      : 'Generate recommendations'}
                  </Button>
                </Stack>
              </Paper>
            )}

          {recommendationSuggestions.length > 0 && (
            <Stack gap="xs">
              {recommendationSuggestions.map(renderSuggestionCard)}
            </Stack>
          )}
        </Stack>
      </Drawer>

      <Modal
        opened={previewSuggestion !== null}
        onClose={() => setPreviewSuggestion(null)}
        title={
          previewSuggestion
            ? `Preview recommendation: ${previewSuggestion.name}`
            : 'Preview recommendation'
        }
        size="xl"
      >
        {previewSuggestion && (
          <Stack gap="md">
            <Paper withBorder p="sm" radius="md">
              <Text fw={700}>{previewSuggestion.name}</Text>
              <Box mt={6}>
                {renderCategoryLabel(previewSuggestion.targetCategory)}
              </Box>
              <Text c="dimmed" mt={6} size="sm">
                {renderConditionSummary(previewSuggestion)}
              </Text>
            </Paper>

            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              {[
                ['Matched', suggestionPreviewCounts?.matched],
                ['Would update', suggestionPreviewCounts?.updated],
                ['Skipped manual', suggestionPreviewCounts?.skippedManual],
              ].map(([label, value]) => (
                <Paper key={label} withBorder p="sm" radius="md">
                  <Text c="dimmed" size="xs" tt="uppercase">
                    {label}
                  </Text>
                  <Text fw={800} size="xl">
                    {value ?? '-'}
                  </Text>
                </Paper>
              ))}
            </SimpleGrid>

            <Alert color="blue">Manual categories are never overwritten.</Alert>

            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={700} size="sm">
                  Transactions to update
                </Text>
                <Text c="dimmed" size="xs">
                  Most recent{' '}
                  {previewSuggestion.previewTransactions.length.toLocaleString()}{' '}
                  of {previewSuggestion.updated.toLocaleString()}
                </Text>
              </Group>
              {previewSuggestion.previewTransactions.length === 0 ? (
                <Text c="dimmed" size="sm">
                  No eligible transactions to update.
                </Text>
              ) : isMobile ? (
                <Box maw="100%" mah={360} style={{ overflowY: 'auto' }}>
                  <TransactionsMobileList
                    data={previewSuggestion.previewTransactions}
                    isError={false}
                    isLoading={false}
                    readOnly
                    totalRows={previewSuggestion.previewTransactions.length}
                    variant="drilldown"
                  />
                </Box>
              ) : (
                <TransactionsTable
                  data={previewSuggestion.previewTransactions}
                  hiddenColumns={['category']}
                  isError={false}
                  isLoading={false}
                  mantineTableContainerProps={{
                    style: { maxHeight: 360, overflowY: 'auto' },
                  }}
                  readOnly
                  totalRows={previewSuggestion.previewTransactions.length}
                />
              )}
            </Stack>

            <Group justify="flex-end">
              <Button
                onClick={() => setPreviewSuggestion(null)}
                variant="subtle"
              >
                Close
              </Button>
              <Button
                leftSection={<Check size={16} />}
                loading={acceptRecommendation.isPending}
                onClick={() =>
                  acceptRecommendation.mutate({ id: previewSuggestion.id })
                }
              >
                Accept rule
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}
