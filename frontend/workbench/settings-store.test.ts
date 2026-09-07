import { describe, expect, it } from 'vitest'
import { createFixtureApi } from './fixture-api'
import { money } from './fixtures'
import type {
  CreatePersonalAccessTokenResponse,
  PersonalAccessToken,
  RecurringManualTransactionSchedule,
} from '../src/api/models'

describe('Settings fixture lifecycle', () => {
  it('reveals only a fake token on creation, keeps list responses private, then revokes it', async () => {
    const api = createFixtureApi()
    const created = await api<CreatePersonalAccessTokenResponse>({
      url: '/user/tokens',
      method: 'POST',
      data: { name: 'Example automation' },
    })
    expect(created.token).toContain('workbench-only-not-a-credential')
    const tokens = await api<Array<PersonalAccessToken>>({
      url: '/user/tokens',
    })
    expect(tokens).toHaveLength(2)
    expect(tokens.every((token) => !('token' in token))).toBe(true)
    await api({ url: `/user/tokens/${created.id}`, method: 'DELETE' })
    expect(await api({ url: '/user/tokens' })).toHaveLength(1)
    expect(await createFixtureApi()({ url: '/user/tokens' })).toHaveLength(1)
  })
  it('round-trips schedule edits, pause/resume and archive without creating transactions', async () => {
    const api = createFixtureApi()
    const created = await api<RecurringManualTransactionSchedule>({
      url: '/recurring-manual-transaction',
      method: 'POST',
      data: {
        accountId: 'cash',
        amount: money('1250', 'negative'),
        merchantName: 'Monthly books',
        categoryId: 'food',
        dayOfMonth: 31,
        startDate: '2027-02-01',
      },
    })
    const path = `/recurring-manual-transaction/${created.id}`
    expect(created.nextOccurrenceDate).toBe('2027-02-28')
    await api({
      url: path,
      method: 'PATCH',
      data: { merchantName: 'Edited schedule', dayOfMonth: 15 },
    })
    expect(await api({ url: `${path}/pause`, method: 'POST' })).toMatchObject({
      merchantName: 'Edited schedule',
      pausedAt: expect.any(String),
    })
    expect(await api({ url: `${path}/resume`, method: 'POST' })).toMatchObject({
      pausedAt: null,
      nextOccurrenceDate: '2027-02-15',
    })
    const schedules = await api<Array<RecurringManualTransactionSchedule>>({
      url: '/recurring-manual-transaction',
    })
    expect(schedules.find((item) => item.id === created.id)).toMatchObject({
      accountName: 'Everyday account',
      category: { id: 'food' },
    })
    await api({ url: path, method: 'DELETE' })
    expect(await api({ url: '/recurring-manual-transaction' })).toHaveLength(1)
    expect(await api({ url: '/transaction' })).toMatchObject({ total: 4 })
    expect(
      await createFixtureApi()({ url: '/recurring-manual-transaction' }),
    ).toHaveLength(1)
  })
  it('rejects failed lifecycle writes before changing fixture data', async () => {
    const api = createFixtureApi({ failure: 'writes' })
    for (const request of [
      { url: '/user/tokens/token-fixture', method: 'DELETE' },
      { url: '/recurring-manual-transaction/schedule/pause', method: 'POST' },
    ]) {
      await expect(api(request)).rejects.toMatchObject({
        response: { status: 503 },
      })
    }
    expect(await api({ url: '/user/tokens' })).toHaveLength(1)
    expect(await api({ url: '/recurring-manual-transaction' })).toEqual([
      expect.objectContaining({ pausedAt: null }),
    ])
  })
})
