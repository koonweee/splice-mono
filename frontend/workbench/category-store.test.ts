import { describe, expect, it } from 'vitest'
import { createFixtureApi } from './fixture-api'
import type {
  BulkCategoryActionResponse,
  Category,
  Transaction,
} from '../src/api/models'

describe('category workbench interactions', () => {
  it('renames referenced categories, archives choices and restores them', async () => {
    const api = createFixtureApi()
    await api({
      method: 'PATCH',
      url: '/category/custom/food',
      data: { detailed: 'Everyday groceries', color: '#112233' },
    })
    expect(
      await api({ url: '/transaction/transaction-fixture' }),
    ).toMatchObject({
      category: { detailed: 'Everyday groceries', color: '#112233' },
    })
    await api({
      method: 'PATCH',
      url: '/category/custom/food',
      data: { archived: true },
    })
    expect(
      (await api<Array<Category>>({ url: '/category' })).some(
        (item) => item.id === 'food',
      ),
    ).toBe(false)
    expect(
      (
        await api<Array<Category>>({
          url: '/category/manage',
          params: { archived: true },
        })
      ).map((item) => item.id),
    ).toEqual(['food'])
    expect(
      (await api<Transaction>({ url: '/transaction/transaction-fixture' }))
        .category?.detailed,
    ).toBe('Everyday groceries')
    await api({
      method: 'PATCH',
      url: '/category/custom/food',
      data: { archived: false },
    })
    expect(
      (
        await api<Array<Category>>({
          url: '/category/search',
          params: { q: 'everyday' },
        })
      ).map((item) => item.id),
    ).toEqual(['food'])
  })
  it('returns actionable conflicts without changing existing categories', async () => {
    const api = createFixtureApi()
    await expect(
      api({
        method: 'POST',
        url: '/category/custom',
        data: { primary: ' food_and_drink ', detailed: 'GROCERIES' },
      }),
    ).rejects.toMatchObject({
      response: { status: 409, data: { category: { categoryId: 'food' } } },
    })
    expect(
      await api({ url: '/category/manage', params: { archived: true } }),
    ).toEqual([])
    const created = await api<Category>({
      method: 'POST',
      url: '/category/custom',
      data: { primary: 'Personal', detailed: 'Books', color: '#456789' },
    })
    expect(created).toMatchObject({
      primary: 'Personal',
      detailed: 'Books',
      color: '#456789',
      archivedAt: null,
    })
    expect(
      (await createFixtureApi()<Array<Category>>({ url: '/category' })).some(
        (item) => item.id === created.id,
      ),
    ).toBe(false)
  })
  it('reports partial bulk results and makes distinct duplicates', async () => {
    const api = createFixtureApi()
    const result = await api<BulkCategoryActionResponse>({
      method: 'PATCH',
      url: '/category/custom/bulk',
      data: { action: 'archive', categoryIds: ['food', 'missing'] },
    })
    expect(result).toEqual({
      requested: 2,
      updated: 1,
      skipped: [{ categoryId: 'missing', reason: 'not_found' }],
    })
    await api({
      method: 'PATCH',
      url: '/category/custom/bulk',
      data: { action: 'restore', categoryIds: ['food'] },
    })
    for (let index = 0; index < 2; index++)
      await api({
        method: 'PATCH',
        url: '/category/custom/bulk',
        data: { action: 'duplicate', categoryIds: ['food'] },
      })
    const categories = await api<Array<Category>>({ url: '/category' })
    expect(categories).toHaveLength(5)
    expect(
      new Set(categories.map((item) => `${item.primary}/${item.detailed}`))
        .size,
    ).toBe(5)
  })
  it('applies deliberate failure before any category mutation', async () => {
    const api = createFixtureApi({ failure: 'writes' })
    await expect(
      api({
        method: 'PATCH',
        url: '/category/custom/food',
        data: { archived: true },
      }),
    ).rejects.toMatchObject({ response: { status: 503 } })
    expect(
      await api({ url: '/category/manage', params: { archived: true } }),
    ).toEqual([])
  })
})
