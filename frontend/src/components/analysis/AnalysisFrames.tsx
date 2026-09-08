import { Box, Grid, Group, Paper, Stack, Text } from '@mantine/core'
import styles from './AnalysisSankeyChart.module.css'
import summaryStyles from './AnalysisSummary.module.css'
import type { ComponentType, ReactNode } from 'react'

export function AnalysisSummaryFrame({
  children,
  progress,
}: {
  children: ReactNode
  progress?: ReactNode
}) {
  return (
    <Paper p="sm" radius="md" withBorder>
      <div
        className={summaryStyles.summary}
        style={{ marginBottom: progress ? 'var(--mantine-spacing-sm)' : 0 }}
      >
        {children}
      </div>
      {progress}
    </Paper>
  )
}
export function CashflowFrame({
  totals,
  chart,
  children,
}: {
  totals?: ReactNode
  chart: ReactNode
  children: ReactNode
}) {
  return (
    <Paper
      p="sm"
      radius="md"
      withBorder
      className={styles.sankeyCard}
      data-testid="analysis-sankey-chart"
    >
      <Stack gap="sm">
        <Group justify="space-between" gap="sm">
          <Text data-typography="sectionHeading">Cashflow</Text>
          {totals}
        </Group>
        <Box className={styles.chartViewport}>{chart}</Box>
        <Box
          className={styles.drilldownList}
          role="region"
          aria-label="Cashflow categories"
        >
          <div className={styles.drilldownGrid}>{children}</div>
        </Box>
      </Stack>
    </Paper>
  )
}
export function AnalysisFlowFrame({ children }: { children: ReactNode }) {
  return (
    <Paper p="lg" radius="md" withBorder>
      {children}
    </Paper>
  )
}

export function AnalysisFlowBody({
  chart,
  children,
}: {
  chart: ReactNode
  children: ReactNode
}) {
  return (
    <Grid gutter="lg" align="center">
      <Grid.Col span={{ base: 12, sm: 4 }}>
        <Box style={{ display: 'flex', justifyContent: 'center' }}>{chart}</Box>
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 8 }}>{children}</Grid.Col>
    </Grid>
  )
}

/** The loaded Sankey and its placeholder reserve the same canvas from known counts. */
export function cashflowCanvasSize(inflows: number, outflows: number) {
  return { width: 900, height: Math.max(360, (inflows + outflows + 2) * 42) }
}

export function AnalysisFlowHeading({
  title,
  icon: Icon,
  iconColor,
  total,
}: {
  title: string
  icon: ComponentType<{ size: number }>
  iconColor: string
  total?: ReactNode
}) {
  return (
    <Group justify="space-between" mb="md">
      <Group gap="xs">
        <Box c={iconColor}>
          <Icon size={18} />
        </Box>
        <Text data-typography="sectionHeading">{title}</Text>
      </Group>
      {total}
    </Group>
  )
}
