import { describe, expect, it } from 'vitest'
import { createFixtureApi } from './fixture-api'
import type {
  CategorizationRuleView,
  PreviewCategorizationRuleApplicationResponse,
} from '../src/api/models'

describe('rule preview and application fixtures', () => {
  it('previews without mutation, then applies only eligible provider records', async () => {
    const api = createFixtureApi()
    const rule = await api<CategorizationRuleView>({
      url: '/categorization-rules',
      method: 'POST',
      data: {
        name: 'Everyday account',
        priority: 1,
        targetCategoryId: 'food',
        conditions: [{ field: 'accountId', operator: 'equals', value: 'cash' }],
      },
    })
    const path = `/categorization-rules/${rule.id}`
    const preview = await api<PreviewCategorizationRuleApplicationResponse>({
      url: `${path}/application-preview`,
    })
    expect(preview).toMatchObject({ matched: 4, updated: 1, skippedManual: 3 })
    expect(await api({ url: '/transaction/travel-transaction' })).toMatchObject(
      { categoryId: 'travel' },
    )
    expect(await api({ url: `${path}/apply`, method: 'POST' })).toEqual({
      matched: 4,
      updated: 1,
      skippedManual: 3,
    })
    expect(await api({ url: '/transaction/travel-transaction' })).toMatchObject(
      {
        categoryId: 'food',
        categoryAssignmentSource: 'rule',
        categoryAssignmentRuleId: rule.id,
      },
    )
    expect(await api({ url: '/transaction/salary' })).toMatchObject({
      categoryId: 'income',
    })
    expect(await api({ url: `${path}/application-preview` })).toMatchObject({
      updated: 0,
    })
  })
  it('matches text and exact major-unit amounts in a draft preview', async () => {
    const api = createFixtureApi()
    const data = {
      targetCategoryId: 'food',
      conditions: [
        {
          field: 'merchantName',
          operator: 'contains',
          value: '  ACCOMMODATION ',
        },
        {
          field: 'amount',
          operator: 'between',
          value: { min: '1050.25', max: '1050.25' },
        },
        { field: 'amountSign', operator: 'equals', value: 'negative' },
      ],
    }
    expect(
      await api({
        url: '/categorization-rules/application-preview',
        method: 'POST',
        data,
      }),
    ).toMatchObject({ matched: 1, updated: 1, skippedManual: 0 })
    expect(await api({ url: '/transaction/travel-transaction' })).toMatchObject(
      { categoryId: 'travel' },
    )
  })
  it('protects manually assigned categories from rule application', async () => {
    const api = createFixtureApi()
    await api({
      url: '/transaction/travel-transaction/category',
      method: 'PATCH',
      data: { categoryId: 'income' },
    })
    expect(
      await api({
        url: '/categorization-rules/application-preview',
        method: 'POST',
        data: {
          targetCategoryId: 'food',
          conditions: [
            {
              field: 'merchantName',
              operator: 'contains',
              value: 'accommodation',
            },
          ],
        },
      }),
    ).toMatchObject({
      matched: 1,
      updated: 0,
      skippedManual: 1,
      manualConflicts: 1,
    })
  })
})
