import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { Divider, Group, Paper, Stack, Text } from '@mantine/core'
import { Pressable } from './Pressable'
import toggleStyles from './SectionToggle.module.css'
import styles from './AccountSection.module.css'
import type { ReactNode } from 'react'

export function AccountSectionPanel({ children }: { children: ReactNode }) {
  return (
    <Paper withBorder p={0} className={styles.panel}>
      <Stack gap={0}>{children}</Stack>
    </Paper>
  )
}
export function AccountGroupHeader({
  label,
  total,
}: {
  label: string
  total: ReactNode
}) {
  return (
    <>
      <Group className={styles.groupHeader} justify="space-between">
        <Text data-typography="label" c="dimmed">
          {label}
        </Text>
        {total}
      </Group>
      <Divider className={styles.groupHeaderDivider} />
    </>
  )
}

export function AccountSectionHeading({
  title,
  opened = true,
  onToggle,
}: {
  title: string
  opened?: boolean
  onToggle?: () => void
}) {
  return (
    <Pressable
      className={toggleStyles.toggle}
      aria-expanded={opened}
      aria-label={`${opened ? 'Collapse' : 'Expand'} ${title}`}
      onClick={onToggle}
      disabled={!onToggle}
      style={{
        borderRadius: 'var(--mantine-radius-sm)',
        marginBottom: 'var(--mantine-spacing-xs)',
      }}
    >
      <Group justify="space-between" px={4} py={2}>
        <Text data-typography="sectionHeading">{title}</Text>
        {opened ? (
          <IconChevronUp size={16} className={toggleStyles.chevron} />
        ) : (
          <IconChevronDown size={16} className={toggleStyles.chevron} />
        )}
      </Group>
    </Pressable>
  )
}
