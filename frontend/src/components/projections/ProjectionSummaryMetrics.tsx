import { Divider, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import { AssumptionPills } from './AssumptionPills'
import type {
  ProjectionAssumption,
  ProjectionMetric,
} from '../../lib/projections/types'

export function ProjectionSummaryMetrics({
  assumptions,
  metrics,
}: {
  assumptions: Array<ProjectionAssumption>
  metrics: Array<ProjectionMetric>
}) {
  return (
    <Paper withBorder p="md" h="100%">
      <Text fw={700} mb="md">
        Projection summary
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {metrics.map((metric) => (
          <Stack key={metric.id} gap={2}>
            <Text size="sm" c="dimmed">
              {metric.label}
            </Text>
            <Text size="xl" fw={700} c="teal">
              {metric.formattedValue}
            </Text>
            {metric.description && (
              <Text size="xs" c="dimmed">
                {metric.description}
              </Text>
            )}
          </Stack>
        ))}
      </SimpleGrid>
      {assumptions.length > 0 && (
        <>
          <Divider my="md" />
          <Group>
            <Text size="sm" fw={600}>
              Key assumptions
            </Text>
            <AssumptionPills assumptions={assumptions} />
          </Group>
        </>
      )}
    </Paper>
  )
}
