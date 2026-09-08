import { Group, Paper, Skeleton, Stack } from '@mantine/core'
import type { ReactNode } from 'react'

export function AnalysisAuditCardFrame({ children }: { children: ReactNode }) {
  return (
    <Paper withBorder p="sm" radius="sm">
      {children}
    </Paper>
  )
}
export function AnalysisAuditSkeleton() {
  return (
    <Stack gap="lg">
      {[0, 1].map((group) => (
        <Stack gap="xs" key={group}>
          <Group justify="space-between">
            <Skeleton h={22} w={180} />
            <Skeleton h={20} w={28} />
          </Group>
          {[0, 1].map((row) => (
            <AnalysisAuditCardFrame key={row}>
              <Group justify="space-between">
                <Skeleton h={20} w="55%" />
                <Skeleton h={20} w={70} />
              </Group>
              <Skeleton mt={4} h={16} w="65%" />
              <Skeleton mt={4} h={16} w="45%" />
            </AnalysisAuditCardFrame>
          ))}
        </Stack>
      ))}
    </Stack>
  )
}
