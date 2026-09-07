import { FIXTURE_NOW, fixtureUser } from './fixtures'
import { matchesRule } from './rule-preview'
import {
  fixtureAnalysisRules,
  fixtureCategorizationRules,
} from './page-fixtures'
import type { AxiosRequestConfig } from 'axios'
import type {
  AnalysisCategoryScope,
  AnalysisCategoryScopeView,
  AnalysisRuleView,
  CategorizationRuleDraftPreview,
  CategorizationRuleRecommendationListResponse,
  CategorizationRuleSuggestion,
  CategorizationRuleView,
  Category,
  CreateAnalysisRuleDto,
  CreateCategorizationRuleDto,
  GenerateCategorizationRuleRecommendationsDto,
  PreviewCategorizationRuleDraftDto,
  Transaction,
  UpdateAnalysisRuleDto,
  UpdateCategorizationRuleDto,
} from '../src/api/models'

type Handler = (config: AxiosRequestConfig) => unknown

export function createRuleStore(
  categories: Array<Category>,
  transactions: Array<Transaction>,
  empty = false,
) {
  const analysis = structuredClone(empty ? [] : fixtureAnalysisRules)
  const categorization = structuredClone(
    empty ? [] : fixtureCategorizationRules,
  )
  let sequence = 1
  const scope = (value: AnalysisCategoryScope): AnalysisCategoryScopeView =>
    value.mode === 'all'
      ? { mode: 'all' }
      : {
          mode: 'selected',
          categories: categories.filter((item) =>
            value.categoryIds?.includes(item.id),
          ),
          includeUncategorized: value.includeUncategorized ?? false,
        }
  const reads: Record<string, Handler> = {
    '/analysis-rules': (config) =>
      analysis.filter(
        (item) =>
          Boolean(item.archivedAt) === (config.params?.archived === true),
      ),
    '/categorization-rules': (config) =>
      categorization
        .filter(
          (item) =>
            Boolean(item.archivedAt) === (config.params?.archived === true),
        )
        .map((item) => ({
          ...item,
          targetCategory:
            categories.find(
              (category) => category.id === item.targetCategoryId,
            ) ?? item.targetCategory,
        })),
  }
  const writes: Record<string, Handler> = {}
  const recommendations: CategorizationRuleRecommendationListResponse = {
    generation: null,
    suggestions: [],
  }
  reads['/categorization-rule-recommendations'] = () => ({
    ...recommendations,
    suggestions: recommendations.suggestions.filter(
      (item) => item.status === 'pending',
    ),
  })
  function preview(
    rule: PreviewCategorizationRuleDraftDto,
    id?: string,
  ): CategorizationRuleDraftPreview {
    const matched = transactions.filter((transaction) =>
      matchesRule(transaction, rule.conditions),
    )
    const manual = matched.filter(
      (item) =>
        item.source === 'manual' || item.categoryAssignmentSource === 'manual',
    )
    const active = categorization
      .filter((item) => !item.archivedAt)
      .sort(
        (a, b) =>
          a.priority - b.priority || a.createdAt.localeCompare(b.createdAt),
      )
    const eligible = matched.filter(
      (item) =>
        !manual.includes(item) &&
        (!id ||
          active.find((candidate) => matchesRule(item, candidate.conditions))
            ?.id === id) &&
        !(
          item.categoryAssignmentRuleId === id &&
          item.categoryId === rule.targetCategoryId &&
          item.categoryAssignmentSource === 'rule'
        ),
    )
    return {
      matched: matched.length,
      updated: eligible.length,
      skippedManual: manual.length,
      transactions: eligible,
      manualAgreement: manual.filter(
        (item) => item.categoryId === rule.targetCategoryId,
      ).length,
      manualConflicts: manual.filter(
        (item) => item.categoryId !== rule.targetCategoryId,
      ).length,
      existingRuleOverlap: matched.filter((item) =>
        active.some((candidate) => matchesRule(item, candidate.conditions)),
      ).length,
    }
  }
  writes['POST /categorization-rules/application-preview'] = (config) =>
    preview(config.data as PreviewCategorizationRuleDraftDto)
  function registerAnalysis(item: AnalysisRuleView) {
    writes[`PATCH /analysis-rules/${item.id}`] = (config) => {
      const { excludeScope, inflowScope, outflowScope, archived, ...draft } =
        config.data as UpdateAnalysisRuleDto
      Object.assign(item, draft, { updatedAt: FIXTURE_NOW })
      if (excludeScope) item.excludeScope = scope(excludeScope)
      if (inflowScope) item.inflowScope = scope(inflowScope)
      if (outflowScope) item.outflowScope = scope(outflowScope)
      if (archived !== undefined)
        item.archivedAt = archived ? FIXTURE_NOW : null
      return item
    }
  }
  function registerCategorization(item: CategorizationRuleView) {
    reads[`/categorization-rules/${item.id}/application-preview`] = () =>
      preview(item, item.id)
    writes[`POST /categorization-rules/${item.id}/apply`] = () => {
      const category = categories.find(
        (candidate) =>
          candidate.id === item.targetCategoryId && !candidate.archivedAt,
      )
      if (item.archivedAt || !category)
        throw new Error('Choose an active rule and category')
      const result = preview(item, item.id)
      result.transactions.forEach((transaction) =>
        Object.assign(transaction, {
          categoryId: category.id,
          category,
          categoryAssignmentSource: 'rule',
          categoryAssignmentRuleId: item.id,
          categoryUpdatedAt: FIXTURE_NOW,
        }),
      )
      return {
        matched: result.matched,
        updated: result.updated,
        skippedManual: result.skippedManual,
      }
    }
    writes[`PATCH /categorization-rules/${item.id}`] = (config) => {
      const { archived, ...draft } = config.data as UpdateCategorizationRuleDto
      Object.assign(item, draft, {
        updatedAt: FIXTURE_NOW,
        revision: item.revision + 1,
      })
      if (draft.targetCategoryId)
        item.targetCategory =
          categories.find(
            (category) => category.id === draft.targetCategoryId,
          ) ?? item.targetCategory
      if (archived !== undefined)
        item.archivedAt = archived ? FIXTURE_NOW : null
      return item
    }
  }
  analysis.forEach(registerAnalysis)
  categorization.forEach(registerCategorization)
  writes['POST /analysis-rules'] = (config) => {
    const draft = config.data as CreateAnalysisRuleDto
    const item: AnalysisRuleView = {
      id: `analysis-created-${sequence++}`,
      name: draft.name,
      type: draft.type,
      excludeScope:
        'excludeScope' in draft ? scope(draft.excludeScope) : { mode: 'all' },
      inflowScope:
        'inflowScope' in draft ? scope(draft.inflowScope) : { mode: 'all' },
      outflowScope:
        'outflowScope' in draft ? scope(draft.outflowScope) : { mode: 'all' },
      archivedAt: null,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    }
    analysis.push(item)
    registerAnalysis(item)
    return item
  }
  function createCategorization(
    draft: CreateCategorizationRuleDto,
  ): CategorizationRuleView {
    const category = categories.find(
      (item) => item.id === draft.targetCategoryId && !item.archivedAt,
    )
    if (!category) throw new Error('Choose an available fixture category')
    const item: CategorizationRuleView = {
      ...draft,
      priority: draft.priority ?? 100,
      id: `categorization-created-${sequence++}`,
      targetCategory: category,
      revision: 1,
      archivedAt: null,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    }
    categorization.push(item)
    registerCategorization(item)
    return item
  }
  writes['POST /categorization-rules'] = (config) =>
    createCategorization(config.data as CreateCategorizationRuleDto)
  function generateRecommendations(config: AxiosRequestConfig) {
    const { ignoredCategoryIds = [] } = (config.data ??
      {}) as GenerateCategorizationRuleRecommendationsDto
    const generationId = `recommendation-generation-${sequence++}`
    recommendations.generation = {
      id: generationId,
      userId: fixtureUser.id,
      status: 'completed',
      model: 'workbench-fixture',
      ignoredCategoryIds,
      startedAt: FIXTURE_NOW,
      completedAt: FIXTURE_NOW,
      failedAt: null,
      errorMessage: null,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    }
    recommendations.suggestions.forEach((item) => {
      if (item.status === 'pending') item.status = 'superseded'
    })
    const category = categories.find(
      (item) => item.id === 'travel' && !item.archivedAt,
    )
    if (!empty && category && !ignoredCategoryIds.includes(category.id)) {
      const draft: CreateCategorizationRuleDto = {
        name: 'Accommodation purchases',
        priority: 100,
        targetCategoryId: category.id,
        conditions: [
          {
            field: 'merchantName',
            operator: 'contains',
            value: 'accommodation',
          },
        ],
      }
      const { transactions: previewTransactions, ...counts } = preview(draft)
      const suggestion: CategorizationRuleSuggestion = {
        ...draft,
        priority: 100,
        ...counts,
        id: `recommendation-${sequence++}`,
        userId: fixtureUser.id,
        generationId,
        targetCategory: category,
        rationale:
          'Synthetic recommendation for inspecting preview and acceptance. No model runs in the workbench.',
        status: 'pending',
        acceptedRuleId: null,
        previewTransactions: structuredClone(previewTransactions),
        generatedBy: 'mastra',
        model: 'workbench-fixture',
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      }
      recommendations.suggestions.push(suggestion)
      for (const action of ['accept', 'dismiss'] as const) {
        writes[
          `POST /categorization-rule-recommendations/${suggestion.id}/${action}`
        ] = () => {
          if (suggestion.status !== 'pending')
            throw new Error('This fixture recommendation is no longer pending')
          if (action === 'accept') {
            const created = createCategorization(draft)
            suggestion.acceptedRuleId = created.id
          }
          suggestion.status = action === 'accept' ? 'accepted' : 'dismissed'
          return { suggestion }
        }
      }
    }
    return reads['/categorization-rule-recommendations']({})
  }
  writes['POST /categorization-rule-recommendations/generate'] =
    generateRecommendations
  writes['POST /categorization-rule-recommendations/regenerate'] =
    generateRecommendations
  return { reads, writes }
}
