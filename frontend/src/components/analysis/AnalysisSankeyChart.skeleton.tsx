import { Box, Group, Skeleton, Stack, Text } from '@mantine/core'
import { CashflowFrame, cashflowCanvasSize } from './AnalysisFrames'
import styles from './AnalysisSankeyChart.module.css'
import type { TransactionAnalysisResponse } from '../../api/models'

export function CashflowSkeleton({
  analysis,
  showTotals = true,
}: {
  analysis?: TransactionAnalysisResponse
  showTotals?: boolean
}) {
  const inflowCount = analysis?.inflows.length ?? 2
  const outflowCount = analysis?.outflows.length ?? 2
  const { width, height } = cashflowCanvasSize(inflowCount, outflowCount)
  const centerX = width / 2
  const centerY = height / 2
  return (
    <CashflowFrame
      totals={showTotals ? <Skeleton h={20} w={160} /> : undefined}
      chart={
        <Box className={styles.chartCanvas} h={height} w={width}>
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden="true"
            focusable="false"
          >
            {/* Neutral topology only: widths are decorative, not financial values. */}
            {([inflowCount, outflowCount] as const).map((count, side) =>
              Array.from({ length: count }, (_, index) => {
                const y =
                  16 + ((height - 32) * (index + 0.5)) / Math.max(1, count)
                const x = side === 0 ? 190 : width - 202
                const startX = side === 0 ? x + 12 : centerX + 6
                const endX = side === 0 ? centerX - 6 : x
                const startY = side === 0 ? y : centerY
                const endY = side === 0 ? centerY : y
                return (
                  <g
                    key={`${side}-${index}`}
                    fill="var(--mantine-color-dimmed)"
                  >
                    <path
                      d={`M${startX},${startY} C${(startX + endX) / 2},${startY} ${(startX + endX) / 2},${endY} ${endX},${endY}`}
                      fill="none"
                      stroke="var(--mantine-color-dimmed)"
                      strokeWidth={14}
                      opacity={0.12}
                    />
                    <rect
                      x={x}
                      y={y - 14}
                      width={12}
                      height={28}
                      rx={2}
                      opacity={0.28}
                    />
                    <rect
                      x={side === 0 ? x - 100 : x + 22}
                      y={y - 3}
                      width={80}
                      height={6}
                      rx={3}
                      opacity={0.16}
                    />
                  </g>
                )
              }),
            )}
            <rect
              x={centerX - 6}
              y={centerY - 48}
              width={12}
              height={96}
              rx={2}
              fill="var(--mantine-color-dimmed)"
              opacity={0.28}
            />
          </svg>
        </Box>
      }
    >
      {(['outflow', 'inflow'] as const).map((direction) => (
        <Box key={direction} data-direction={direction}>
          <Text data-typography="subsectionHeading" mb={4}>
            {direction === 'inflow' ? 'Inflows' : 'Outflows'}
          </Text>
          {Array.from(
            {
              length: analysis
                ? direction === 'inflow'
                  ? analysis.inflows.length
                  : analysis.outflows.length
                : 2,
            },
            (_, row) => (
              <Stack key={row} gap={4} className={styles.categoryButton}>
                <Group wrap="nowrap">
                  <Skeleton circle h={10} w={10} />
                  <Skeleton h={20} flex={1} />
                  <Skeleton h={20} w={48} />
                </Group>
                <Skeleton className={styles.compactProgress} h={4} />
              </Stack>
            ),
          )}
        </Box>
      ))}
    </CashflowFrame>
  )
}
