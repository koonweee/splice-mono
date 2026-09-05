import { Alert, Button, Group, Loader, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

interface DataStateProps {
  children?: ReactNode
  hasData: boolean
  isLoading?: boolean
  isError?: boolean
  isFetching?: boolean
  loadingMessage?: string
  errorMessage?: string
  emptyMessage?: string
  onRetry?: () => void
}

/** Keep existing results visible when a refresh fails. */
export function DataState({
  children,
  hasData,
  isLoading = false,
  isError = false,
  isFetching = false,
  loadingMessage = 'Loading results…',
  errorMessage = 'Unable to load results.',
  emptyMessage = 'No results found.',
  onRetry,
}: DataStateProps) {
  if (isLoading && !hasData) {
    return (
      <Group justify="center" py="lg" role="status">
        <Loader aria-hidden size="sm" />
        <Text c="dimmed" size="sm">
          {loadingMessage}
        </Text>
      </Group>
    )
  }

  return (
    <>
      {isError && (
        <Alert color="red" title="Unable to load data" mb={hasData ? 'md' : 0}>
          <Stack align="flex-start" gap="xs">
            <Text size="sm">{errorMessage}</Text>
            {hasData && (
              <Text size="sm">Previously loaded results are shown below.</Text>
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
      )}
      {hasData ? (
        children
      ) : !isError ? (
        <Text c="dimmed" size="sm" ta="center" py="lg" role="status">
          {emptyMessage}
        </Text>
      ) : null}
    </>
  )
}
