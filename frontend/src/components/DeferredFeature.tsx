import { Alert, Box, Button, Loader, Stack, Text } from '@mantine/core'
import { Component, Suspense } from 'react'
import type { ReactNode } from 'react'

class FeatureErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <Alert color="red" title={`${this.props.label} could not load`}>
          <Stack gap="sm">
            <Text size="sm">Reload the page to try again.</Text>
            <Button variant="light" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </Stack>
        </Alert>
      )
    }
    return this.props.children
  }
}

/** Keep a deferred feature's loading or failure local to its section. */
export function DeferredFeature({
  children,
  label,
  minHeight,
}: {
  children: ReactNode
  label: string
  minHeight?: number
}) {
  return (
    <FeatureErrorBoundary label={label}>
      <Suspense
        fallback={
          <Box
            mih={minHeight}
            role="status"
            aria-label={`Loading ${label.toLowerCase()}`}
          >
            <Stack align="center" justify="center" py="md" gap="xs">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Loading {label.toLowerCase()}…
              </Text>
            </Stack>
          </Box>
        }
      >
        {children}
      </Suspense>
    </FeatureErrorBoundary>
  )
}
