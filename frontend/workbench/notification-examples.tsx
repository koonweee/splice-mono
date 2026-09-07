import { Group, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import {
  NotificationBell,
  NotificationInbox,
} from '../src/components/notifications/NotificationInbox'
import { fixtureNotifications } from './notification-store'
import { FIXTURE_NOW } from './fixtures'
import type { ExampleProps } from './examples'

function InboxExample({ state }: ExampleProps) {
  const [opened, setOpened] = useState(true)
  const [items, setItems] = useState(() =>
    structuredClone(
      ['empty', 'error', 'loading'].includes(state) ? [] : fixtureNotifications,
    ),
  )
  const [retried, setRetried] = useState(false)
  const [error, setError] = useState(state === 'mutation-error')
  const [destination, setDestination] = useState('')
  const unreadCount = items.filter((item) => !item.readAt).length
  const update = (id: string, dismiss = false) => {
    if (state === 'mutation-error') {
      setError(true)
      return
    }
    setItems((previous) =>
      dismiss
        ? previous.filter((item) => item.id !== id)
        : previous.map((item) =>
            item.id === id ? { ...item, readAt: FIXTURE_NOW } : item,
          ),
    )
  }
  return (
    <Stack>
      <Group justify="space-between">
        <Text fw={700} size="lg">
          Splice
        </Text>
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
            ? 'Unable to update this notification. Please try again.'
            : undefined
        }
        onRetry={() => {
          setRetried(true)
          setItems(structuredClone(fixtureNotifications))
        }}
        onRead={(item) => update(item.id)}
        onDismiss={(item) => update(item.id, true)}
        onOpen={(item) => {
          if (state === 'mutation-error') {
            setError(true)
            return
          }
          update(item.id)
          setDestination(`Opened ${item.url}`)
          setOpened(false)
        }}
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
    ],
    components: ['NotificationBell', 'NotificationInbox'],
  },
]
