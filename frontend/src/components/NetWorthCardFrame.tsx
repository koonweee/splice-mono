import { Box, Paper } from '@mantine/core'
import styles from './NetWorthCardFrame.module.css'
import type { ReactNode } from 'react'

/** Lightweight geometry shared by summary, data and chart-module loading. */
export function NetWorthCardFrame({
  summary,
  chart,
  period,
}: {
  summary: ReactNode
  chart: ReactNode
  period?: ReactNode
}) {
  return (
    <Paper mb={8} bg="transparent">
      <Box className={styles.summary}>{summary}</Box>
      <Box mt="xs" h={180} pos="relative">
        {chart}
      </Box>
      {period && <Box mt={8}>{period}</Box>}
    </Paper>
  )
}
