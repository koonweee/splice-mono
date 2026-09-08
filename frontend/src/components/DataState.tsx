import { Alert, Button, Stack, Text, VisuallyHidden } from '@mantine/core'
import { useEffect, useState } from 'react'
import { LoadingSkeleton } from './loading/LoadingSkeleton'
import styles from './DataState.module.css'
import type { ReactNode } from 'react'

interface DataStateProps {
  children?: ReactNode
  hasData: boolean
  /** Only opt in when the page coordinator exposes retained-data failures in the header. */
  backgroundErrorMode?: 'local' | 'header'
  isLoading?: boolean
  isError?: boolean
  isFetching?: boolean
  loadingMessage?: string
  errorTitle?: string
  errorMessage?: string
  emptyMessage?: string
  onRetry?: () => void
  loadingFallback: ReactNode
}

/** Retain matching results and their geometry during refresh, including failure. */
export function DataState({
  children,
  hasData,
  backgroundErrorMode = 'local',
  isLoading = false,
  isError = false,
  isFetching = false,
  loadingMessage = 'Loading results…',
  errorTitle = 'Unable to load data',
  errorMessage = 'Unable to load results.',
  emptyMessage = 'No results found.',
  onRetry,
  loadingFallback,
}: DataStateProps) {
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    if (!isError || isFetching) setDismissed(false)
  }, [isError, isFetching])
  if (isLoading && !hasData)
    return (
      <LoadingSkeleton label={loadingMessage}>
        {loadingFallback}
      </LoadingSkeleton>
    )
  const error = isError &&
    (!hasData || (backgroundErrorMode === 'local' && !dismissed)) && (
      <Alert
        color="red"
        withCloseButton={hasData}
        closeButtonLabel="Dismiss loading error"
        onClose={() => setDismissed(true)}
        title={errorTitle}
        className={hasData ? styles.refreshError : undefined}
      >
        <Stack align="flex-start" gap="xs">
          <Text data-typography="bodySmall">{errorMessage}</Text>
          {hasData && (
            <Text data-typography="bodySmall">
              Previously loaded results remain visible.
            </Text>
          )}
          {onRetry && (
            <Button
              color="red"
              loading={isFetching}
              onClick={onRetry}
              variant="light"
            >
              Retry
            </Button>
          )}
        </Stack>
      </Alert>
    )
  if (hasData)
    return (
      <div className={styles.frame} aria-busy={isFetching}>
        {isFetching && backgroundErrorMode === 'local' && (
          <VisuallyHidden role="status">Refreshing results…</VisuallyHidden>
        )}
        {children}
        {error}
      </div>
    )
  return (
    <div className={styles.emptyFrame}>
      <div aria-hidden="true" inert className={styles.shape}>
        {loadingFallback}
      </div>
      <div className={styles.message}>
        {error || (
          <Text data-typography="metadata" c="dimmed" ta="center" role="status">
            {emptyMessage}
          </Text>
        )}
      </div>
    </div>
  )
}
