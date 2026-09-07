import {
  ActionIcon,
  Alert,
  Button,
  Drawer,
  Group,
  Indicator,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { Bell, Check, CheckCheck, Landmark, RefreshCw, X } from 'lucide-react'
import { DataState } from '../DataState'
import { InteractiveRow } from '../InteractiveRow'
import { formatDateTime } from '../../lib/format'
import styles from './NotificationInbox.module.css'
import type { NotificationInboxItem } from '../../api/models'

export function NotificationBell({
  unreadCount,
  opened,
  unavailable = false,
  onClick,
}: {
  unreadCount?: number
  opened: boolean
  unavailable?: boolean
  onClick: () => void
}) {
  const label = unavailable
    ? 'Notifications, unread status unavailable'
    : unreadCount === undefined
      ? 'Notifications'
      : `Notifications, ${unreadCount} unread`
  return (
    <Tooltip label={label}>
      <Indicator disabled={!unreadCount} size={7} offset={5}>
        <ActionIcon
          aria-label={label}
          aria-expanded={opened}
          aria-haspopup="dialog"
          variant={opened ? 'light' : 'subtle'}
          onClick={onClick}
        >
          <Bell size={18} />
        </ActionIcon>
      </Indicator>
    </Tooltip>
  )
}

export interface NotificationInboxProps {
  opened: boolean
  onClose: () => void
  items: Array<NotificationInboxItem>
  unreadCount?: number
  isLoading?: boolean
  isError?: boolean
  isFetching?: boolean
  onRetry: () => void
  pendingId?: string
  mutationError?: string
  onRead: (item: NotificationInboxItem) => void
  onDismiss: (item: NotificationInboxItem) => void
  onOpen: (item: NotificationInboxItem) => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}

/** The drawer is presentational: requests and authenticated ownership stay outside. */
export function NotificationInbox({
  opened,
  onClose,
  items,
  unreadCount,
  isLoading,
  isError,
  isFetching,
  onRetry,
  pendingId,
  mutationError,
  onRead,
  onDismiss,
  onOpen,
  hasMore,
  loadingMore,
  onLoadMore,
}: NotificationInboxProps) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={424}
      title={
        <Stack gap={0}>
          <Text data-typography="dialogTitle">
            Notifications
          </Text>
          <Text data-typography="caption" c="dimmed" aria-live="polite">
            {unreadCount === undefined
              ? 'Unread status unavailable'
              : `${unreadCount} unread`}
          </Text>
        </Stack>
      }
      closeButtonProps={{ 'aria-label': 'Close notifications' }}
      classNames={{
        content: styles.content,
        header: styles.header,
        body: styles.body,
      }}
    >
      {mutationError && (
        <Alert color="red" role="alert" m="md">
          {mutationError}
        </Alert>
      )}
      <DataState
        hasData={items.length > 0}
        isLoading={isLoading}
        isError={isError}
        isFetching={isFetching}
        loadingMessage="Loading notifications…"
        emptyMessage="You're all caught up."
        errorTitle="Unable to load notifications"
        errorMessage="Please retry when your connection is available."
        onRetry={onRetry}
      >
        <ul className={styles.list} aria-label="Notifications">
          {items.map((item) => (
            <li
              key={item.id}
              className={styles.item}
              data-unread={!item.readAt || undefined}
            >
              <InteractiveRow
                actionLabel={`Open ${item.title}`}
                onActivate={pendingId ? undefined : () => onOpen(item)}
              >
                <div className={styles.row}>
                  <ThemeIcon
                    variant="light"
                    color={
                      item.type === 'bank_link.needs_attention'
                        ? 'orange'
                        : undefined
                    }
                    size={30}
                    radius="md"
                  >
                    {item.type === 'bank_link.needs_attention' ? (
                      <Landmark size={16} />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                  </ThemeIcon>
                  <div className={styles.detail}>
                    <Group gap="xs" wrap="nowrap">
                      <Text data-typography="rowTitleSmall">
                        {item.title}
                      </Text>
                      {!item.readAt && (
                        <span
                          className={styles.unread}
                          role="img"
                          aria-label="Unread"
                        />
                      )}
                    </Group>
                    <Text data-typography="bodySmall" c="dimmed">
                      {item.body}
                    </Text>
                    <div className={styles.meta}>
                      <Text
                        data-typography="caption"
                        c="dimmed"
                        component="time"
                        dateTime={item.createdAt}
                      >
                        {formatDateTime(item.createdAt)}
                      </Text>
                      <Group gap={2} wrap="nowrap">
                        <Tooltip label={item.readAt ? 'Read' : 'Mark as read'}>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label={`${item.readAt ? 'Read' : 'Mark as read'}: ${item.title}`}
                            disabled={
                              Boolean(item.readAt) || Boolean(pendingId)
                            }
                            loading={pendingId === item.id}
                            onClick={() => onRead(item)}
                          >
                            {item.readAt ? (
                              <CheckCheck size={16} />
                            ) : (
                              <Check size={16} />
                            )}
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Dismiss">
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label={`Dismiss: ${item.title}`}
                            disabled={Boolean(pendingId)}
                            onClick={() => onDismiss(item)}
                          >
                            <X size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </div>
                  </div>
                </div>
              </InteractiveRow>
            </li>
          ))}
        </ul>
      </DataState>
      {hasMore && (
        <Group justify="center" p="md">
          <Button variant="subtle" loading={loadingMore} onClick={onLoadMore}>
            Load more
          </Button>
        </Group>
      )}
    </Drawer>
  )
}
