import { Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import { ChevronRight, GitCompareArrows } from 'lucide-react'
import { formatMoneyNumber } from '../../lib/format'
import type {
  ProjectionResult,
  ProjectionScenario,
} from '../../lib/projections/types'

export function ScenarioComparison({
  result,
  scenario,
}: {
  result: ProjectionResult
  scenario: ProjectionScenario
}) {
  const endValue =
    [...result.points]
      .reverse()
      .find((point) => point.projectedMedian !== undefined)
      ?.projectedMedian ?? 0

  return (
    <Paper withBorder p="md">
      <Text fw={700} mb="md">
        Scenario comparison
      </Text>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Paper withBorder p="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Group gap="xs">
                <Text fw={700}>Base case</Text>
                <Text size="xs" c="teal">
                  Selected
                </Text>
              </Group>
              <Text size="sm" c="dimmed">
                End value in {scenario.horizonYears} years
              </Text>
              <Text size="xl" fw={700} c="teal">
                {formatMoneyNumber({
                  value: endValue,
                  currency: scenario.currency,
                  decimals: 0,
                })}
              </Text>
            </Stack>
            <ChevronRight size={22} />
          </Group>
        </Paper>
        <Paper withBorder p="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Text fw={700}>Add comparison</Text>
              <Text size="sm" c="dimmed">
                Ask for a variant to compare engine-computed outcomes.
              </Text>
              <Text size="sm" c="teal">
                Awaiting computed scenario
              </Text>
            </Stack>
            <GitCompareArrows size={22} />
          </Group>
        </Paper>
      </SimpleGrid>
    </Paper>
  )
}
