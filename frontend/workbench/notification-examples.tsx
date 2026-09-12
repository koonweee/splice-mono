import { Group, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import {
  NotificationBell,
  NotificationInbox,
} from '../src/components/notifications/NotificationInbox'
import { fixtureNotifications } from './notification-store'
import type { ExampleProps } from './examples'

function InboxExample({ state }: ExampleProps) {
  const [opened, setOpened] = useState(true)
  const [items, setItems] = useState(() =>
    structuredClone(
      ['empty', 'error', 'loading'].includes(state)
        ? []
        : fixtureNotifications.filter((item) => !item.readAt),
    ),
  )
  const [retried, setRetried] = useState(false)
  const [error, setError] = useState(
    state === 'mutation-error' || state === 'clear-error',
  )
  const [destination, setDestination] = useState('')
  const unreadCount = items.filter((item) => !item.readAt).length
  const update = (id: string) => {
    if (state === 'mutation-error') {
      setError(true)
      return
    }
    setItems((previous) => previous.filter((item) => item.id !== id))
  }
  const clearAll = () => {
    if (state === 'clear-error') {
      setError(true)
      return
    }
    setItems([])
  }
  return (
    <Stack component="main">
      <Group justify="space-between">
        <Text data-typography="brand">Splice</Text>
        <NotificationBell
          opened={opened}
          unreadCount={unreadCount}
          onClick={() => setOpened(true)}
        />
      </Group>
      <Text role="status">
        {destination || 'Transaction badge: 12 uncategorized'}
      </Text>
      <NotificationInbox
        opened={opened}
        onClose={() => setOpened(false)}
        items={items}
        unreadCount={unreadCount}
        isLoading={state === 'loading' && !retried}
        isError={['error', 'refresh-error'].includes(state) && !retried}
        isFetching={state === 'refreshing'}
        pendingId={state === 'pending' ? items[0]?.id : undefined}
        mutationError={
          error
            ? state === 'clear-error'
              ? 'Unable to clear notifications. Please try again.'
              : 'Unable to update this notification. Please try again.'
            : undefined
        }
        onRetry={() => {
          setRetried(true)
          setItems(
            structuredClone(
              fixtureNotifications.filter((item) => !item.readAt),
            ),
          )
        }}
        onDismiss={(item) => update(item.id)}
        onOpen={(item) => {
          if (state === 'mutation-error') {
            setError(true)
            return
          }
          update(item.id)
          setDestination(`Opened ${item.url}`)
          setOpened(false)
        }}
        clearing={state === 'clearing'}
        onClearAll={clearAll}
      />
    </Stack>
  )
}

export const notificationExamples = [
  {
    id: 'notification-inbox',
    title: 'Notification inbox',
    component: InboxExample,
    states: [
      'ready',
      'loading',
      'empty',
      'error',
      'refresh-error',
      'refreshing',
      'pending',
      'mutation-error',
      'clearing',
      'clear-error',
    ],
    components: [
      'NotificationBell',
      'NotificationInbox',
      'NotificationInboxSkeleton',
    ],
  },
]
