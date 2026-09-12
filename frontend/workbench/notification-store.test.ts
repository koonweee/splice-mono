import { describe, expect, it } from 'vitest'
import { createFixtureApi } from './fixture-api'

type Summary = {
  unreadNotificationCount: number
  uncategorizedTransactionCount: number
}
type Page = { items: Array<{ id: string; readAt: string | null }> }
const getSummary = { method: 'GET', url: '/notification/summary' }

describe('notification fixtures', () => {
  it('reads and dismisses idempotently without changing transaction counts or another frame', async () => {
    const first = createFixtureApi()
    const other = createFixtureApi()
    const original = await first<Summary>(getSummary)
    const read = { method: 'PATCH', url: '/notification/sync-today/read' }
    await first(read)
    await first(read)
    expect(await first<Summary>(getSummary)).toMatchObject({
      unreadNotificationCount: 1,
      uncategorizedTransactionCount: original.uncategorizedTransactionCount,
    })
    const dismiss = { method: 'PATCH', url: '/notification/connection/archive' }
    await first(dismiss)
    await first(dismiss)
    expect(await first<Summary>(getSummary)).toMatchObject({
      unreadNotificationCount: 0,
      uncategorizedTransactionCount: original.uncategorizedTransactionCount,
    })
    expect(await other<Summary>(getSummary)).toEqual(original)
    const page = await first<Page>({ url: '/notification/inbox' })
    expect(page.items).toEqual([])
  })
  it('keeps alerts unchanged on failed writes and fails closed for unknown IDs', async () => {
    const api = createFixtureApi({ failure: 'writes' })
    await expect(
      api({ method: 'PATCH', url: '/notification/sync-today/read' }),
    ).rejects.toThrow()
    expect(await api<Summary>(getSummary)).toMatchObject({
      unreadNotificationCount: 2,
    })
    await expect(
      api({ method: 'PATCH', url: '/notification/unknown/read' }),
    ).rejects.toThrow('Unmocked workbench request')
  })
  it('clears every alert in one frame without changing transaction counts', async () => {
    const first = createFixtureApi()
    const other = createFixtureApi()
    const original = await first<Summary>(getSummary)

    await first({ method: 'PATCH', url: '/notification/archive-all' })

    expect(await first<Summary>(getSummary)).toMatchObject({
      unreadNotificationCount: 0,
      uncategorizedTransactionCount: original.uncategorizedTransactionCount,
    })
    expect((await first<Page>({ url: '/notification/inbox' })).items).toEqual(
      [],
    )
    expect(await other<Summary>(getSummary)).toEqual(original)
  })
})
