import { Badge, Group, Tooltip } from '@mantine/core'
import { Info } from 'lucide-react'
import type { ProjectionAssumption } from '../../lib/projections/types'

export function AssumptionPills({
  assumptions,
}: {
  assumptions: Array<ProjectionAssumption>
}) {
  if (assumptions.length === 0) return null

  return (
    <Group gap="xs">
      {assumptions.map((assumption) => (
        <Tooltip
          key={assumption.id}
          label={`${assumption.label}: ${assumption.valueLabel}`}
        >
          <Badge
            variant="light"
            color="teal"
            leftSection={<Info size={12} />}
            styles={{ label: { textTransform: 'none' } }}
          >
            {assumption.label}: {assumption.valueLabel}
          </Badge>
        </Tooltip>
      ))}
    </Group>
  )
}
