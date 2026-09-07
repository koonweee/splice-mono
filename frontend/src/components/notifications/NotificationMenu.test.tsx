import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationMenu } from './NotificationMenu'

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  inbox: vi.fn(),
  read: vi.fn(),
  archive: vi.fn(),
  archiveAll: vi.fn(),
  transition: vi.fn(),
}))
vi.mock('../../api/clients/spliceAPI', () => ({
  notificationControllerGetSummary: api.summary,
  notificationControllerGetInbox: api.inbox,
  notificationControllerMarkRead: api.read,
  notificationControllerArchive: api.archive,
  notificationControllerArchiveAll: api.archiveAll,
}))
vi.mock('../../lib/pwa/app-transition', () => ({
  requestAppTransition: api.transition,
}))
const item = {
  id: 'one',
  type: 'transactions.new_synced' as const,
  title: 'New transactions synced',
  body: '2 new transactions',
  createdAt: '2026-09-06T12:00:00Z',
  readAt: null as string | null,
  url: '/transactions?categoryId=UNCATEGORIZED',
}
let client: QueryClient
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  api.summary.mockResolvedValue({
    unreadNotificationCount: 1,
    uncategorizedTransactionCount: 12,
    computedAt: '2026-09-06T12:00:00Z',
  })
  api.inbox.mockResolvedValue({
    items: [item],
    hasMore: false,
    nextCursor: null,
  })
  api.read.mockResolvedValue(undefined)
  api.archive.mockResolvedValue(undefined)
  api.archiveAll.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})
function mount() {
  const navigate = vi.fn()
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <NotificationMenu onNavigate={navigate} />
      </QueryClientProvider>
    </MantineProvider>,
  )
  return navigate
}

describe('authenticated notification menu', () => {
  it('loads the inbox only on opening, focuses its drawer, and restores focus after Escape', async () => {
    mount()
    const bell = await screen.findByRole('button', {
      name: 'Notifications, 1 unread',
    })
    expect(api.inbox).not.toHaveBeenCalled()
    bell.focus()
    fireEvent.click(bell)
    await screen.findByText(item.body)
    expect(api.inbox).toHaveBeenCalledOnce()
    const dialog = screen.getByRole('dialog')
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    )
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Close notifications' }),
      { key: 'Escape' },
    )
    await waitFor(() =>
      expect(bell.getAttribute('aria-expanded')).toBe('false'),
    )
    await waitFor(() => expect(document.activeElement).toBe(bell))
  })
  it('leaves failed dismissals visible and supports retry without navigating', async () => {
    const navigate = mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    )
    api.archive
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce(undefined)
    fireEvent.click(
      await screen.findByRole('button', { name: `Dismiss: ${item.title}` }),
    )
    await screen.findByText(
      'Unable to update this notification. Please try again.',
    )
    expect(screen.getByText(item.body)).toBeTruthy()
    api.inbox.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })
    api.summary.mockResolvedValue({
      unreadNotificationCount: 0,
      uncategorizedTransactionCount: 12,
      computedAt: '2026-09-06T12:01:00Z',
    })
    fireEvent.click(
      screen.getByRole('button', { name: `Dismiss: ${item.title}` }),
    )
    await screen.findByText("You're all caught up.")
    expect(navigate).not.toHaveBeenCalled()
    expect(client.getQueryData(['/notification/summary'])).toMatchObject({
      unreadNotificationCount: 0,
      uncategorizedTransactionCount: 12,
    })
  })
  it('marks only the selected item read and defers its destination through the editor guard', async () => {
    const navigate = mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: `Open ${item.title}` }),
    )
    await waitFor(() => expect(api.transition).toHaveBeenCalledOnce())
    expect(api.read).toHaveBeenCalledWith(item.id)
    expect(navigate).not.toHaveBeenCalled()
    api.transition.mock.calls[0][0]()
    expect(navigate).toHaveBeenCalledWith(
      '/transactions?categoryId=UNCATEGORIZED',
    )
  })
  it('clears every notification while preserving the independent transaction count', async () => {
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    )
    await screen.findByText(item.body)
    api.inbox.mockResolvedValue({ items: [], hasMore: false, nextCursor: null })
    api.summary.mockResolvedValue({
      unreadNotificationCount: 0,
      uncategorizedTransactionCount: 12,
      computedAt: '2026-09-06T12:01:00Z',
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear all notifications' }),
    )

    await screen.findByText("You're all caught up.")
    expect(api.archiveAll).toHaveBeenCalledOnce()
    expect(client.getQueryData(['/notification/summary'])).toMatchObject({
      unreadNotificationCount: 0,
      uncategorizedTransactionCount: 12,
    })
  })
  it('retains notifications when clearing fails', async () => {
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    )
    await screen.findByText(item.body)
    api.archiveAll.mockRejectedValueOnce(new Error('Unavailable'))

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear all notifications' }),
    )

    await screen.findByText('Unable to clear notifications. Please try again.')
    expect(screen.getByText(item.body)).toBeTruthy()
  })
})
