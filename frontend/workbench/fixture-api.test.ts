import { describe, expect, it, vi } from 'vitest'
import { createFixtureApi } from './fixture-api'
import { money } from './fixtures'
import type { Account, Transaction } from '../src/api/models'

describe('workbench API fixtures', () => {
  it('fails a later transaction refresh and recovers without changing data or another frame', async () => {
    let failing = false
    const api = createFixtureApi({
      shouldFailRead: (path) => failing && path === '/transaction',
    })
    const otherFrame = createFixtureApi()
    const before = await api({ url: '/transaction' })
    failing = true
    await expect(api({ url: '/transaction' })).rejects.toMatchObject({
      response: { status: 503 },
    })
    await expect(api({ url: '/account' })).resolves.toBeDefined()
    await expect(otherFrame({ url: '/transaction' })).resolves.toEqual(before)
    failing = false
    await expect(api({ url: '/transaction' })).resolves.toEqual(before)
  })
  it('round-trips manual creation, editing, reporting dates and deletion', async () => {
    const api = createFixtureApi()
    const draft = {
      accountId: 'cash',
      amount: money('1250', 'negative'),
      merchantName: 'Workbench lunch',
      providerDate: '2026-09-03',
      categoryId: 'food',
    }
    const created = await api<Transaction>({
      method: 'POST',
      url: '/transaction/manual',
      data: draft,
    })
    const url = `/transaction/${created.id}`
    expect(created).toMatchObject({
      accountName: 'Everyday account',
      category: { id: 'food' },
      activityDate: draft.providerDate,
    })
    await api({
      method: 'PATCH',
      url,
      data: { reportingDateOverride: '2026-09-05' },
    })
    expect(await api({ url })).toMatchObject({ activityDate: '2026-09-05' })
    await api({
      method: 'PATCH',
      url: `${url}/manual`,
      data: {
        ...draft,
        merchantName: 'Edited lunch',
        providerDate: '2026-09-02',
      },
    })
    expect(await api({ url })).toMatchObject({
      merchantName: 'Edited lunch',
      reportingDateOverride: null,
      activityDate: '2026-09-02',
    })
    await api({
      method: 'PATCH',
      url: `${url}/category`,
      data: { categoryId: null },
    })
    const filtered = await api<{ data: Array<Transaction> }>({
      url: '/transaction',
      params: {
        categoryId: 'UNCATEGORIZED',
        startDate: '2026-09-02',
        endDate: '2026-09-02',
        amountSign: 'negative',
      },
    })
    expect(filtered.data.map((item) => item.id)).toEqual([created.id])
    await api({ method: 'DELETE', url: `${url}/manual` })
    expect(
      (
        await api<{ data: Array<Transaction> }>({ url: '/transaction' })
      ).data.some((item) => item.id === created.id),
    ).toBe(false)
    await expect(api({ url })).rejects.toThrow('Unmocked workbench request')
  })
  it('keeps provider transactions protected and failed transaction writes unchanged', async () => {
    const api = createFixtureApi()
    await expect(
      api({ method: 'DELETE', url: '/transaction/travel-transaction/manual' }),
    ).rejects.toThrow('Unmocked workbench request')
    const failing = createFixtureApi({ failure: 'writes' })
    await expect(
      failing({
        method: 'PATCH',
        url: '/transaction/salary/category',
        data: { categoryId: null },
      }),
    ).rejects.toMatchObject({ response: { status: 503 } })
    expect(await failing({ url: '/transaction/salary' })).toMatchObject({
      categoryId: 'income',
    })
    expect(await api({ url: '/transaction/salary' })).toMatchObject({
      categoryId: 'income',
    })
  })
  it('round-trips edits in one document without sharing another document store', async () => {
    const first = createFixtureApi()
    const second = createFixtureApi()
    await first({
      method: 'PATCH',
      url: '/account/cash',
      data: { name: 'Renamed fixture' },
    })
    const updated = await first<Array<Account>>({ url: '/account' })
    const isolated = await second<Array<Account>>({ url: '/account' })
    expect(updated.find((a) => a.id === 'cash')?.name).toBe('Renamed fixture')
    expect(isolated.find((a) => a.id === 'cash')?.name).toBe('Everyday account')
    updated[0].name = 'Response object mutation'
    expect((await first<Array<Account>>({ url: '/account' }))[0].name).not.toBe(
      'Response object mutation',
    )
  })
  it('rejects unknown endpoints, external origins and bank linking without transport', async () => {
    const fetch = vi.spyOn(window, 'fetch')
    const api = createFixtureApi()
    for (const url of [
      '/bank-link',
      '/user/settings',
      '/missing',
      'http://localhost:3000/account',
      '//localhost:3000/account',
    ]) {
      await expect(api({ url, method: 'POST' })).rejects.toThrow(
        'Unmocked workbench request',
      )
    }
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRestore()
  })
  it('fails only the chosen operation kind and does not mutate on failed writes', async () => {
    const api = createFixtureApi({ failure: 'writes' })
    await expect(
      api({
        method: 'PATCH',
        url: '/account/cash',
        data: { name: 'Never applied' },
      }),
    ).rejects.toMatchObject({ response: { status: 503 } })
    expect(
      (await api<Array<Account>>({ url: '/account' })).find(
        (a) => a.id === 'cash',
      )?.name,
    ).toBe('Everyday account')
    await expect(
      createFixtureApi({ failure: 'reads' })({ url: '/account' }),
    ).rejects.toMatchObject({ response: { status: 503 } })
  })
  it('honors cancellation during fixture latency', async () => {
    const controller = new AbortController()
    const request = createFixtureApi({ latency: 3000 })({
      url: '/account',
      signal: controller.signal,
    })
    controller.abort()
    await expect(request).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  })
})
