import { describe, expect, it } from 'vitest'
import { createFixtureApi } from './fixture-api'
import type {
  AcceptCategorizationRuleSuggestionResponse,
  CategorizationRuleRecommendationGenerationResponse,
  CategorizationRuleView,
} from '../src/api/models'

const root = '/categorization-rule-recommendations'

describe('recommendation workbench fixtures', () => {
  it('previews without mutation and accepts once in the current frame', async () => {
    const api = createFixtureApi()
    const before = await api({ url: '/transaction' })
    expect(await api({ url: root })).toEqual({
      generation: null,
      suggestions: [],
    })
    const generated =
      await api<CategorizationRuleRecommendationGenerationResponse>({
        url: `${root}/generate`,
        method: 'POST',
        data: {},
      })
    expect(generated.generation).toMatchObject({
      status: 'completed',
      model: 'workbench-fixture',
    })
    const suggestion = generated.suggestions[0]
    expect(suggestion).toMatchObject({
      matched: 1,
      updated: 1,
      skippedManual: 0,
      previewTransactions: [{ id: 'travel-transaction' }],
    })
    const result = await api<AcceptCategorizationRuleSuggestionResponse>({
      url: `${root}/${suggestion.id}/accept`,
      method: 'POST',
    })
    expect(result.suggestion.status).toBe('accepted')
    const rules = await api<Array<CategorizationRuleView>>({
      url: '/categorization-rules',
    })
    expect(
      rules.find((rule) => rule.id === result.suggestion.acceptedRuleId),
    ).toMatchObject({
      name: suggestion.name,
      conditions: suggestion.conditions,
      targetCategoryId: 'travel',
    })
    expect(await api({ url: '/transaction' })).toEqual(before)
    expect(await api({ url: root })).toMatchObject({ suggestions: [] })
    await expect(
      api({ url: `${root}/${suggestion.id}/accept`, method: 'POST' }),
    ).rejects.toThrow('no longer pending')
    expect(
      await createFixtureApi()({ url: '/categorization-rules' }),
    ).toHaveLength(1)
  })
  it('dismisses without creating a rule and supersedes stale suggestions', async () => {
    const api = createFixtureApi()
    const generate = () =>
      api<CategorizationRuleRecommendationGenerationResponse>({
        url: `${root}/regenerate`,
        method: 'POST',
      })
    const first = (await generate()).suggestions[0]
    const second = (await generate()).suggestions[0]
    await expect(
      api({ url: `${root}/${first.id}/accept`, method: 'POST' }),
    ).rejects.toThrow('no longer pending')
    expect(
      await api({ url: `${root}/${second.id}/dismiss`, method: 'POST' }),
    ).toMatchObject({
      suggestion: { status: 'dismissed', acceptedRuleId: null },
    })
    expect(await api({ url: '/categorization-rules' })).toHaveLength(1)
    expect(await api({ url: root })).toMatchObject({ suggestions: [] })
  })
  it('supports ignored/empty results and preserves state on write failures', async () => {
    const api = createFixtureApi()
    expect(
      await api({
        url: `${root}/generate`,
        method: 'POST',
        data: { ignoredCategoryIds: ['travel'] },
      }),
    ).toMatchObject({
      generation: { ignoredCategoryIds: ['travel'] },
      suggestions: [],
    })
    expect(
      await createFixtureApi({ empty: true })({
        url: `${root}/generate`,
        method: 'POST',
      }),
    ).toMatchObject({ suggestions: [] })
    const failing = createFixtureApi({ failure: 'writes' })
    await expect(
      failing({ url: `${root}/generate`, method: 'POST' }),
    ).rejects.toMatchObject({ response: { status: 503 } })
    expect(await failing({ url: root })).toEqual({
      generation: null,
      suggestions: [],
    })
  })
})
