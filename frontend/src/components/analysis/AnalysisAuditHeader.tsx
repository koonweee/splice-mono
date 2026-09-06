import { Box, Button, Group, Text } from '@mantine/core'
import { ClipboardList } from 'lucide-react'
import { formatDateRangeLabel } from '../../lib/date-range'
import styles from './AnalysisAuditHeader.module.css'

export function AnalysisAuditHeader({
  startDate,
  endDate,
  lookaroundDays,
}: {
  startDate: string
  endDate: string
  lookaroundDays?: number
}) {
  return (
    <Group justify="space-between" align="flex-start" gap="sm">
      <Box style={{ minWidth: 0 }}>
        <Text size="sm" c="dimmed">
          {formatDateRangeLabel([startDate, endDate])}
        </Text>
        <Text size="xs" c="dimmed" mih={18}>
          {lookaroundDays === undefined
            ? '\u00a0'
            : `Refund matching window: ${lookaroundDays} days`}
        </Text>
      </Box>
      <Button
        component="a"
        href="/settings?tab=analysis"
        variant="light"
        leftSection={<ClipboardList size={16} />}
        size="sm"
        className={styles.manageButton}
      >
        Manage rules
      </Button>
    </Group>
  )
}
