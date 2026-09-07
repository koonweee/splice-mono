import { describe, expect, it } from 'vitest'
import { createFixtureApi } from './fixture-api'
import type {
  BulkTransactionCategoryUpdateResponse,
  Transaction,
} from '../src/api/models'

describe('bulk category fixture flow', () => {
  it('updates only provider records and restores the original category metadata', async () => {
    const api = createFixtureApi()
    const before = await api<Transaction>({
      url: '/transaction/travel-transaction',
    })
    const result = await api<BulkTransactionCategoryUpdateResponse>({
      url: '/transaction/category/bulk',
      method: 'POST',
      data: {
        transactionIds: ['travel-transaction', 'salary', 'travel-transaction'],
        categoryId: 'food',
      },
    })
    expect(result).toMatchObject({
      count: 1,
      transactionIds: ['travel-transaction'],
    })
    expect(await api({ url: '/transaction/travel-transaction' })).toMatchObject(
      { categoryId: 'food', categoryAssignmentSource: 'manual' },
    )
    expect(await api({ url: '/transaction/salary' })).toMatchObject({
      categoryId: 'income',
    })
    await api({
      url: '/transaction/category/bulk/undo',
      method: 'POST',
      data: { undo: result.undo },
    })
    expect(await api({ url: '/transaction/travel-transaction' })).toEqual(
      before,
    )
  })
  it('validates the entire selection before changing it', async () => {
    const api = createFixtureApi()
    await expect(
      api({
        url: '/transaction/category/bulk',
        method: 'POST',
        data: {
          transactionIds: ['travel-transaction', 'missing'],
          categoryId: null,
        },
      }),
    ).rejects.toMatchObject({ response: { status: 404 } })
    expect(await api({ url: '/transaction/travel-transaction' })).toMatchObject(
      { categoryId: 'travel' },
    )
  })
  it('keeps undo references within their fixture instance and refuses unavailable original categories', async () => {
    const api = createFixtureApi()
    const other = createFixtureApi()
    const result = await api<BulkTransactionCategoryUpdateResponse>({
      url: '/transaction/category/bulk',
      method: 'POST',
      data: { transactionIds: ['travel-transaction'], categoryId: null },
    })
    await expect(
      other({
        url: '/transaction/category/bulk/undo',
        method: 'POST',
        data: { undo: result.undo },
      }),
    ).rejects.toMatchObject({ response: { status: 404 } })
    await api({
      url: '/category/custom/travel',
      method: 'PATCH',
      data: { archived: true },
    })
    await expect(
      api({
        url: '/transaction/category/bulk/undo',
        method: 'POST',
        data: { undo: result.undo },
      }),
    ).rejects.toMatchObject({ response: { status: 404 } })
    expect(await api({ url: '/transaction/travel-transaction' })).toMatchObject(
      { categoryId: null },
    )
  })
  it('leaves data unchanged under deliberate write failure', async () => {
    const api = createFixtureApi({ failure: 'writes' })
    await expect(
      api({
        url: '/transaction/category/bulk',
        method: 'POST',
        data: { transactionIds: ['travel-transaction'], categoryId: null },
      }),
    ).rejects.toMatchObject({ response: { status: 503 } })
    expect(await api({ url: '/transaction/travel-transaction' })).toMatchObject(
      { categoryId: 'travel' },
    )
  })
})
