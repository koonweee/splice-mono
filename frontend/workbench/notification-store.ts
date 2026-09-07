import { FIXTURE_NOW } from './fixtures'
import type { AxiosRequestConfig } from 'axios'
import type { NotificationInboxItem } from '../src/api/models'

export const fixtureNotifications: Array<NotificationInboxItem> = [
  {
    id: 'sync-today',
    type: 'transactions.new_synced',
    title: 'New transactions synced',
    body: '2 new transactions are ready to review.',
    url: '/transactions?categoryId=UNCATEGORIZED',
    createdAt: '2026-09-06T11:55:00.000Z',
    readAt: null,
  },
  {
    id: 'connection',
    type: 'bank_link.needs_attention',
    title: 'Bank connection needs attention',
    body: 'Reconnect Example Bank to keep your accounts up to date.',
    url: '/accounts',
    createdAt: '2026-09-06T11:20:00.000Z',
    readAt: null,
  },
  {
    id: 'sync-yesterday',
    type: 'transactions.new_synced',
    title: 'Transactions synced',
    body: '5 new transactions were synced.',
    url: '/transactions',
    createdAt: '2026-09-05T18:00:00.000Z',
    readAt: FIXTURE_NOW,
  },
]

/** Per-frame history, with the same read/archive semantics as the real API. */
export function createNotificationStore(
  empty: boolean | undefined,
  uncategorizedCount: () => number,
) {
  const items = structuredClone(empty ? [] : fixtureNotifications)
  const archived = new Set<string>()
  const reads: Record<string, (config: AxiosRequestConfig) => unknown> = {
    '/notification/summary': () => ({
      unreadNotificationCount: items.filter(
        (item) => !item.readAt && !archived.has(item.id),
      ).length,
      uncategorizedTransactionCount: uncategorizedCount(),
      computedAt: FIXTURE_NOW,
    }),
    '/notification/inbox': ({ params }) => {
      const visible = items.filter((item) => !archived.has(item.id))
      const start = params?.cursor
        ? visible.findIndex((item) => item.id === params.cursor) + 1
        : 0
      const page = visible.slice(start, start + Number(params?.pageSize ?? 20))
      const hasMore = start + page.length < visible.length
      return {
        items: page,
        hasMore,
        nextCursor: hasMore ? page.at(-1)?.id : null,
      }
    },
  }
  const writes: Record<string, () => unknown> = {}
  for (const item of items) {
    writes[`PATCH /notification/${item.id}/read`] = () => {
      item.readAt ??= FIXTURE_NOW
    }
    writes[`PATCH /notification/${item.id}/archive`] = () => {
      archived.add(item.id)
    }
  }
  return { reads, writes }
}
