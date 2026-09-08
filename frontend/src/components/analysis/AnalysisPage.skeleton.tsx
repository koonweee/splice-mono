import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Grid, Group, Skeleton, Stack, Text } from '@mantine/core'
import { AnalysisDonutSkeleton } from './AnalysisDonut.skeleton'
import {
  AnalysisFlowBody,
  AnalysisFlowFrame,
  AnalysisFlowHeading,
  AnalysisSummaryFrame,
} from './AnalysisFrames'
import { CashflowSkeleton } from './AnalysisSankeyChart.skeleton'

export function AnalysisSkeleton({ sankey = true }: { sankey?: boolean }) {
  return (
    <Stack gap="md">
      <AnalysisSummaryFrame progress={<Skeleton h={5} radius="xl" />}>
        {['Inflows', 'Outflows', 'Net'].map((label) => (
          <div key={label}>
            <Text data-typography="label" c="dimmed">
              {label}
            </Text>
            <Skeleton h={25} w={64} />
          </div>
        ))}
      </AnalysisSummaryFrame>
      {sankey ? (
        <CashflowSkeleton showTotals={false} />
      ) : (
        <Grid>
          {[0, 1].map((index) => (
            <Grid.Col span={{ base: 12, md: 6 }} key={index}>
              <AnalysisFlowFrame>
                <AnalysisFlowHeading
                  title={index === 0 ? 'Inflows' : 'Outflows'}
                  icon={index === 0 ? ArrowDownLeft : ArrowUpRight}
                  iconColor={
                    index === 0
                      ? 'var(--splice-positive)'
                      : 'var(--splice-negative)'
                  }
                  total={<Skeleton h={25} w={64} />}
                />
                <AnalysisFlowBody chart={<AnalysisDonutSkeleton />}>
                  <Stack gap={4}>
                    {[0, 1, 2].map((row) => (
                      <Group key={row} py={6} px="xs" wrap="nowrap">
                        <Skeleton circle h={10} w={10} />
                        <Skeleton h={22} flex={1} />
                        <Skeleton h={22} w={56} />
                      </Group>
                    ))}
                  </Stack>
                </AnalysisFlowBody>
              </AnalysisFlowFrame>
            </Grid.Col>
          ))}
        </Grid>
      )}
    </Stack>
  )
}
