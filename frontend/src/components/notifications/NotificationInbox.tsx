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
import {
  Bell,
  Check,
  CheckCheck,
  Landmark,
  ListX,
  RefreshCw,
  X,
} from 'lucide-react'
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
  clearing?: boolean
  onClearAll?: () => void
}

/** The sheet is presentational: requests and authenticated ownership stay outside. */
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
  clearing = false,
  onClearAll,
}: NotificationInboxProps) {
  const actionsDisabled = Boolean(pendingId) || clearing

  return (
    <Drawer.Root
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="min(90dvh, 760px)"
      classNames={{ content: styles.content }}
    >
      <Drawer.Overlay />
      <Drawer.Content>
        <Drawer.Header className={styles.header}>
          <Drawer.Title>
            <Stack gap={0}>
              <Text data-typography="dialogTitle">Notifications</Text>
              <Text data-typography="caption" c="dimmed" aria-live="polite">
                {unreadCount === undefined
                  ? 'Unread status unavailable'
                  : `${unreadCount} unread`}
              </Text>
            </Stack>
          </Drawer.Title>
          <Group className={styles.headerActions} gap={2} wrap="nowrap">
            <Tooltip label="Clear all notifications">
              <ActionIcon
                size="lg"
                variant="subtle"
                color="gray"
                aria-label="Clear all notifications"
                disabled={!onClearAll || items.length === 0 || actionsDisabled}
                loading={clearing}
                onClick={onClearAll}
              >
                <ListX size={18} />
              </ActionIcon>
            </Tooltip>
            <Drawer.CloseButton size="lg" aria-label="Close notifications" />
          </Group>
        </Drawer.Header>
        <Drawer.Body className={styles.body}>
          <div className={styles.scroller}>
            <div className={styles.bodyContent}>
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
                        onActivate={
                          actionsDisabled ? undefined : () => onOpen(item)
                        }
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
                            <Text data-typography="rowTitleSmall">
                              {item.title}
                            </Text>
                            <Text data-typography="bodySmall" c="dimmed">
                              {item.body}
                            </Text>
                            <Text
                              data-typography="caption"
                              c="dimmed"
                              component="time"
                              dateTime={item.createdAt}
                            >
                              {formatDateTime(item.createdAt)}
                            </Text>
                          </div>
                          <Group
                            className={styles.rowActions}
                            gap={2}
                            wrap="nowrap"
                          >
                            <Tooltip
                              label={item.readAt ? 'Read' : 'Mark as read'}
                            >
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label={`${item.readAt ? 'Read' : 'Mark as read'}: ${item.title}`}
                                disabled={
                                  Boolean(item.readAt) || actionsDisabled
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
                                disabled={actionsDisabled}
                                onClick={() => onDismiss(item)}
                              >
                                <X size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </div>
                      </InteractiveRow>
                    </li>
                  ))}
                </ul>
              </DataState>
              {hasMore && (
                <Group justify="center" p="md">
                  <Button
                    variant="subtle"
                    loading={loadingMore}
                    onClick={onLoadMore}
                  >
                    Load more
                  </Button>
                </Group>
              )}
            </div>
          </div>
        </Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  )
}
