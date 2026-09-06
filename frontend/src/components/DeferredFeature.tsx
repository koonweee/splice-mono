import { Alert, Box, Button, Stack, Text } from '@mantine/core'
import { Component, Suspense } from 'react'
import {
  ChartSkeleton,
  FormSkeleton,
  LoadingSkeleton,
} from './loading/LoadingSkeleton'
import type { ReactNode } from 'react'

class FeatureErrorBoundary extends Component<
  {
    children: ReactNode
    label: string
    minHeight?: number
    errorFallback?: (content: ReactNode) => ReactNode
  },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      const content = (
        <Alert
          mih={this.props.minHeight}
          color="red"
          title={`${this.props.label} could not load`}
        >
          <Stack gap="sm">
            <Text size="sm">Reload the page to try again.</Text>
            <Button variant="light" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </Stack>
        </Alert>
      )
      return this.props.errorFallback?.(content) ?? content
    }
    return this.props.children
  }
}

/** Keep a deferred feature's loading or failure local to its section. */
export function DeferredFeature({
  children,
  label,
  minHeight,
  fallback,
  errorFallback,
}: {
  children: ReactNode
  label: string
  minHeight?: number
  fallback?: ReactNode
  errorFallback?: (content: ReactNode) => ReactNode
}) {
  return (
    <FeatureErrorBoundary
      label={label}
      minHeight={minHeight}
      errorFallback={errorFallback}
    >
      <Suspense
        fallback={
          <Box mih={minHeight}>
            {fallback ?? (
              <LoadingSkeleton label={`Loading ${label.toLowerCase()}…`}>
                {minHeight ? (
                  <ChartSkeleton height={minHeight} />
                ) : (
                  <FormSkeleton />
                )}
              </LoadingSkeleton>
            )}
          </Box>
        }
      >
        {children}
      </Suspense>
    </FeatureErrorBoundary>
  )
}
