import { Box, Group, Text } from '@mantine/core'
import styles from './ValueAdjustmentsSection.module.css'
import type { ReactNode } from 'react'

export function ValueAdjustmentsFrame({
  action,
  children,
}: {
  action: ReactNode
  children?: ReactNode
}) {
  return (
    <Box className={styles.section}>
      <Group justify="space-between">
        <Text data-typography="label">Value adjustments</Text>
        {action}
      </Group>
      {children}
    </Box>
  )
}
