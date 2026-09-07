import { describe, expect, it } from 'vitest'
import { createFixtureApi } from './fixture-api'
import type {
  AnalysisRuleView,
  CategorizationRuleView,
} from '../src/api/models'

describe('rule manager fixtures', () => {
  it('round-trips analysis scopes and archive/restore without leaking between frames', async () => {
    const api = createFixtureApi()
    const created = await api<AnalysisRuleView>({
      url: '/analysis-rules',
      method: 'POST',
      data: {
        name: 'Exclude groceries',
        type: 'exclude',
        excludeScope: {
          mode: 'selected',
          categoryIds: ['food'],
          includeUncategorized: true,
        },
      },
    })
    expect(created.excludeScope).toMatchObject({
      mode: 'selected',
      categories: [{ id: 'food' }],
      includeUncategorized: true,
    })
    await api({
      url: `/analysis-rules/${created.id}`,
      method: 'PATCH',
      data: { name: 'Renamed exclusion', archived: true },
    })
    expect(await api({ url: '/analysis-rules' })).toHaveLength(1)
    expect(
      await api({ url: '/analysis-rules', params: { archived: true } }),
    ).toEqual([expect.objectContaining({ name: 'Renamed exclusion' })])
    await api({
      url: `/analysis-rules/${created.id}`,
      method: 'PATCH',
      data: { archived: false },
    })
    expect(await api({ url: '/analysis-rules' })).toHaveLength(2)
    expect(await createFixtureApi()({ url: '/analysis-rules' })).toHaveLength(1)
  })
  it('preserves categorization conditions and resolves edited target categories', async () => {
    const api = createFixtureApi()
    const conditions = [
      { field: 'merchantName', operator: 'contains', value: 'accommodation' },
    ]
    const created = await api<CategorizationRuleView>({
      url: '/categorization-rules',
      method: 'POST',
      data: {
        name: 'Trips',
        targetCategoryId: 'travel',
        priority: 5,
        conditions,
      },
    })
    expect(created).toMatchObject({
      conditions,
      targetCategory: { id: 'travel' },
      revision: 1,
    })
    expect(
      await api({
        url: `/categorization-rules/${created.id}`,
        method: 'PATCH',
        data: { targetCategoryId: 'food', priority: 20, archived: true },
      }),
    ).toMatchObject({
      targetCategory: { id: 'food' },
      priority: 20,
      revision: 2,
    })
    expect(
      await api({ url: '/categorization-rules', params: { archived: true } }),
    ).toHaveLength(1)
    await api({
      url: `/categorization-rules/${created.id}`,
      method: 'PATCH',
      data: { archived: false },
    })
    expect(await api({ url: '/categorization-rules' })).toHaveLength(2)
  })
  it('leaves both rule managers unchanged when writes fail', async () => {
    const api = createFixtureApi({ failure: 'writes' })
    for (const url of [
      '/analysis-rules/analysis-rule',
      '/categorization-rules/category-rule',
    ]) {
      await expect(
        api({ url, method: 'PATCH', data: { archived: true } }),
      ).rejects.toMatchObject({ response: { status: 503 } })
    }
    expect(await api({ url: '/analysis-rules' })).toHaveLength(1)
    expect(await api({ url: '/categorization-rules' })).toHaveLength(1)
  })
})
