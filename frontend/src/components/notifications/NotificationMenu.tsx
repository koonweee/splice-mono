import { useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  notificationInboxQueryOptions,
  notificationSummaryQueryOptions,
  useNotificationAction,
} from '../../lib/queries/notification'
import { getApiErrorMessage } from '../../lib/api-errors'
import {
  assertAuthGeneration,
  getAuthGeneration,
} from '../../lib/auth-generation'
import { requestAppTransition } from '../../lib/pwa/app-transition'
import { NotificationBell, NotificationInbox } from './NotificationInbox'
import type { NotificationInboxItem } from '../../api/models'

/** Only mount after the private session boundary has verified the current owner. */
export function NotificationMenu({
  onNavigate,
}: {
  onNavigate: (url: string) => void
}) {
  const [opened, setOpened] = useState(false)
  const [error, setError] = useState<string>()
  const busy = useRef(false)
  const summary = useQuery(notificationSummaryQueryOptions())
  const inbox = useInfiniteQuery({
    ...notificationInboxQueryOptions(),
    enabled: opened,
  })
  const mutation = useNotificationAction()

  const act = async (
    item: NotificationInboxItem,
    action: 'read' | 'archive',
    navigate = false,
  ) => {
    if (busy.current) return
    busy.current = true
    setError(undefined)
    const generation = getAuthGeneration()
    try {
      if (action === 'archive' || !item.readAt)
        await mutation.mutateAsync({ id: item.id, action })
      assertAuthGeneration(generation)
      if (navigate) {
        const destination = new URL(item.url, window.location.origin)
        if (
          destination.origin !== window.location.origin ||
          !['/transactions', '/accounts'].includes(destination.pathname)
        )
          throw new Error('This notification destination is unavailable.')
        requestAppTransition(() => {
          if (getAuthGeneration() !== generation) return
          onNavigate(
            destination.pathname + destination.search + destination.hash,
          )
        })
        setOpened(false)
      }
    } catch (cause) {
      if (getAuthGeneration() === generation)
        setError(
          getApiErrorMessage(
            cause,
            'Unable to update this notification. Please try again.',
          ),
        )
    } finally {
      busy.current = false
    }
  }

  return (
    <>
      <NotificationBell
        unreadCount={summary.data?.unreadNotificationCount}
        unavailable={summary.isError}
        opened={opened}
        onClick={() => {
          setError(undefined)
          setOpened(true)
        }}
      />
      <NotificationInbox
        opened={opened}
        onClose={() => setOpened(false)}
        items={inbox.data?.pages.flatMap((page) => page.items) ?? []}
        unreadCount={
          summary.isError ? undefined : summary.data?.unreadNotificationCount
        }
        isLoading={inbox.isPending}
        isFetching={inbox.isFetching}
        isError={inbox.isError}
        onRetry={() => {
          void inbox.refetch()
          void summary.refetch()
        }}
        pendingId={mutation.isPending ? mutation.variables.id : undefined}
        mutationError={error}
        onRead={(item) => void act(item, 'read')}
        onDismiss={(item) => void act(item, 'archive')}
        onOpen={(item) => void act(item, 'read', true)}
        hasMore={inbox.hasNextPage}
        loadingMore={inbox.isFetchingNextPage}
        onLoadMore={() => void inbox.fetchNextPage()}
      />
    </>
  )
}
