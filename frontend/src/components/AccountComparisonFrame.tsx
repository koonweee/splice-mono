import { Box, Group, Text } from '@mantine/core'
import { TIME_PERIOD_LABELS } from '../lib/types'
import type { TimePeriod } from '../lib/types'
import type { ReactNode } from 'react'

export function AccountComparisonFrame({
  period,
  children,
}: {
  period: TimePeriod
  children: ReactNode
}) {
  return (
    <Group justify="space-between">
      <Text data-typography="metadata" c="dimmed">
        {period === 'all'
          ? 'Change since first recorded balance'
          : `${TIME_PERIOD_LABELS[period]} balance change`}
      </Text>
      <Box className="splice-touch-target splice-change-trigger">
        {children}
      </Box>
    </Group>
  )
}
