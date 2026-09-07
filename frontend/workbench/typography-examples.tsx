import { Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { PageHeader } from '../src/components/PageHeader'
import {
  compactTypographyRoles,
  typographyRoles,
} from '../src/lib/design-system/typography'
import type { TypographyRole } from '../src/lib/design-system/typography'

function Typography() {
  return (
    <Stack>
      <PageHeader title="Typography" mb={0} />
      <Text data-typography="metadata" c="dimmed">
        Production roles: resize to compare page titles. Metrics come directly
        from the canonical definitions.
      </Text>
      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Title order={3} data-typography="sectionHeading">
            Manual accounts
          </Title>
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={0} miw={0}>
              <Text data-typography="rowTitle" truncate>
                Everyday account
              </Text>
              <Text data-typography="metadata" c="dimmed">
                Example Bank · Checking
              </Text>
            </Stack>
            <Text data-typography="amount">$12,345.67</Text>
          </Group>
          <TextInput
            label="Account name"
            defaultValue="Everyday account"
            description="Shared input and label roles"
          />
        </Stack>
      </Paper>
      {(Object.keys(typographyRoles) as Array<TypographyRole>).map((role) => {
        const metrics = typographyRoles[role]
        const compact = compactTypographyRoles[role]
        return (
          <Paper key={role} p="sm" withBorder>
            <Text data-typography="caption" c="dimmed">
              {role} · {metrics.fontSize} / {metrics.fontWeight} /{' '}
              {metrics.lineHeight}
              {compact ? ` · compact: ${compact.fontSize}` : ''}
            </Text>
            <Text data-typography={role} style={{ overflowWrap: 'anywhere' }}>
              {role.startsWith('amount') ||
              role.startsWith('numeric') ||
              role === 'display'
                ? '$503,719.29'
                : 'A clear view of your finances'}
            </Text>
          </Paper>
        )
      })}
    </Stack>
  )
}

export const typographyExamples = [
  {
    id: 'typography',
    title: 'Typography roles',
    component: Typography,
    states: ['ready'],
    components: ['PageHeader'],
  },
]
