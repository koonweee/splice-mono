import {
  ActionIcon,
  Box,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core'
import { Check, Eye, Pencil, Trash2 } from 'lucide-react'
import { settingsRowActionColumnWidth } from './settings-row-action-layout'
import { SettingsCompactRowFrame } from './SettingsCompactRowFrame'
import styles from './SettingsCompactRow.module.css'
import { SettingsListPlaceholder } from './SettingsTableFrame'
import type { ReactNode } from 'react'

export const categorizationRulesSectionColumns = [
  { header: 'Name', size: 180, minSize: 180 },
  { header: 'Then categorize as', size: 220, minSize: 220 },
  { header: 'When', size: 280, minSize: 280 },
  { header: 'Priority', size: 100 },
  { header: 'Status', size: 110 },
  { header: 'Actions', size: settingsRowActionColumnWidth(3) },
] as const

export function CategorizationRulesSkeleton() {
  return (
    <SettingsListPlaceholder
      layout={{ fill: true }}
      mobileRow={
        <SettingsCompactRowFrame
          heading={
            <>
              <Skeleton h={22} className={styles.title} />
              <Skeleton h={20} w={55} />
              <Skeleton h={28} w={28} />
            </>
          }
        >
          <Skeleton h={20} w="75%" />
          <div className={styles.result}>
            <Skeleton h={20} w={120} />
            <Skeleton h={20} w={75} className={styles.priority} />
          </div>
        </SettingsCompactRowFrame>
      }
      columns={categorizationRulesSectionColumns}
    />
  )
}

export function RecommendationCardFrame({ children }: { children: ReactNode }) {
  return (
    <Paper withBorder p="sm" radius="md">
      {children}
    </Paper>
  )
}
export function RecommendationsSkeleton() {
  return (
    <Stack gap="xs">
      {[0, 1, 2].map((index) => (
        <RecommendationCardFrame key={index}>
          <Group
            align="flex-start"
            gap="sm"
            justify="space-between"
            wrap="nowrap"
          >
            <Box style={{ flex: '1 1 auto', minWidth: 0 }}>
              <Skeleton h={22} w="50%" />
              <Skeleton mt={4} h={20} w="40%" />
              <Text component="div" data-typography="metadata" mt={6}>
                <Skeleton w="80%">
                  &nbsp;
                  <br />
                  &nbsp;
                </Skeleton>
              </Text>
              <Group gap="xs" mt={8}>
                {[0, 1, 2].map((badge) => (
                  <Skeleton key={badge} h={22} w={70} />
                ))}
              </Group>
              <Text component="div" data-typography="caption" mt={6}>
                <Skeleton w="90%">
                  &nbsp;
                  <br />
                  &nbsp;
                </Skeleton>
              </Text>
            </Box>
            <Group gap={2} justify="flex-end" wrap="nowrap">
              {[Eye, Pencil, Check, Trash2].map((Icon, action) => (
                <ActionIcon key={action} disabled variant="transparent">
                  <Icon size={16} />
                </ActionIcon>
              ))}
            </Group>
          </Group>
        </RecommendationCardFrame>
      ))}
    </Stack>
  )
}
