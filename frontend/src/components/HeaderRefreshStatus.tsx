import {
  ActionIcon,
  Button,
  Popover,
  Stack,
  Text,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core'
import { CircleAlert, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import styles from './HeaderRefreshStatus.module.css'
import type { RefreshStatus } from '../lib/page-refresh'

export type { RefreshStatus } from '../lib/page-refresh'

/** Caller owns refresh work; this component only presents its aggregate state. */
export function HeaderRefreshStatus({
  status,
  onRetry,
}: {
  status: RefreshStatus
  onRetry?: () => void
}) {
  const [edgeVisible, setEdgeVisible] = useState(false)
  const [opened, setOpened] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const failed = status.phase === 'offline' || status.phase === 'error'
  useEffect(() => {
    setEdgeVisible(false)
    if (status.phase !== 'refreshing') return
    const timer = window.setTimeout(() => setEdgeVisible(true), 200)
    return () => window.clearTimeout(timer)
  }, [status.phase])
  useEffect(() => {
    if (!failed) setOpened(false)
  }, [failed])
  const savedAt =
    status.lastSuccessfulAt === null
      ? null
      : new Date(status.lastSuccessfulAt).toLocaleString()
  const detail =
    status.phase === 'offline'
      ? `Offline${savedAt ? ` · Showing saved data from ${savedAt}` : ''}`
      : `Couldn't refresh${savedAt ? ` · Last updated ${savedAt}` : ''}`
  const announcement = failed
    ? detail
    : status.phase === 'refreshing'
      ? 'Updating saved data…'
      : ''
  return (
    <>
      {status.phase === 'refreshing' && edgeVisible && (
        <span className={styles.edge} aria-hidden="true" />
      )}
      <span className={styles.slot}>
        {failed && (
          <Popover
            opened={opened}
            onChange={setOpened}
            position="bottom-start"
            width={280}
            withinPortal
            trapFocus
            returnFocus
            onClose={() => {
              setOpened(false)
              trigger.current?.focus()
            }}
          >
            <Tooltip
              label={detail}
              disabled={opened}
              events={{ hover: true, focus: true, touch: false }}
              multiline
              w={260}
            >
              <Popover.Target>
                <ActionIcon
                  ref={trigger}
                  variant="subtle"
                  c="dimmed"
                  aria-label={detail}
                  aria-expanded={opened}
                  aria-haspopup="dialog"
                  className={styles.trigger}
                  onClick={() => setOpened((value) => !value)}
                >
                  {status.phase === 'offline' ? (
                    <WifiOff size={16} />
                  ) : (
                    <CircleAlert size={16} />
                  )}
                </ActionIcon>
              </Popover.Target>
            </Tooltip>
            <Popover.Dropdown role="dialog" aria-label="Refresh status">
              <Stack gap="xs" align="flex-start">
                <Text data-typography="bodySmall">{detail}</Text>
                {onRetry && (
                  <Button
                    variant="subtle"
                    onClick={() => {
                      setOpened(false)
                      trigger.current?.focus()
                      onRetry()
                    }}
                  >
                    Retry
                  </Button>
                )}
              </Stack>
            </Popover.Dropdown>
          </Popover>
        )}
      </span>
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </VisuallyHidden>
    </>
  )
}
