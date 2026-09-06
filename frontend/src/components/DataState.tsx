import { Alert, Button, Stack, Text, VisuallyHidden } from '@mantine/core'
import { useEffect, useState } from 'react'
import { LoadingSkeleton, RowSkeleton } from './loading/LoadingSkeleton'
import styles from './DataState.module.css'
import type { ReactNode } from 'react'

interface DataStateProps {
  children?: ReactNode
  hasData: boolean
  isLoading?: boolean
  isError?: boolean
  isFetching?: boolean
  loadingMessage?: string
  errorTitle?: string
  errorMessage?: string
  emptyMessage?: string
  onRetry?: () => void
  loadingFallback?: ReactNode
}

/** Retain matching results and their geometry during refresh, including failure. */
export function DataState({
  children,
  hasData,
  isLoading = false,
  isError = false,
  isFetching = false,
  loadingMessage = 'Loading results…',
  errorTitle = 'Unable to load data',
  errorMessage = 'Unable to load results.',
  emptyMessage = 'No results found.',
  onRetry,
  loadingFallback = <RowSkeleton />,
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
  const error = isError && (!hasData || !dismissed) && (
    <Alert
      color="red"
      withCloseButton={hasData}
      closeButtonLabel="Dismiss loading error"
      onClose={() => setDismissed(true)}
      title={errorTitle}
      className={hasData ? styles.refreshError : undefined}
    >
      <Stack align="flex-start" gap="xs">
        <Text size="sm">{errorMessage}</Text>
        {hasData && (
          <Text size="sm">Previously loaded results remain visible.</Text>
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
        {isFetching && (
          <VisuallyHidden role="status">Refreshing results…</VisuallyHidden>
        )}
        {children}
        {error}
      </div>
    )
  return (
    <div className={styles.emptyFrame}>
      <div aria-hidden="true" className={styles.shape}>
        {loadingFallback}
      </div>
      <div className={styles.message}>
        {error || (
          <Text c="dimmed" size="sm" ta="center" role="status">
            {emptyMessage}
          </Text>
        )}
      </div>
    </div>
  )
}
