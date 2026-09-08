import { Box, Paper } from '@mantine/core'
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
      {summary}
      <Box mt="xs" h={180} pos="relative">
        {chart}
      </Box>
      {period && <Box mt={8}>{period}</Box>}
    </Paper>
  )
}
