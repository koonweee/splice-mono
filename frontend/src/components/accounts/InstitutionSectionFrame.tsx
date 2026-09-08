import { Group, Paper, Stack } from '@mantine/core'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { Pressable } from '../Pressable'
import toggleStyles from '../SectionToggle.module.css'
import type { ReactNode } from 'react'

export function InstitutionAccountsFrame({
  children,
}: {
  children: ReactNode
}) {
  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <Stack gap={0}>{children}</Stack>
    </Paper>
  )
}

export function InstitutionHeadingFrame({
  children,
  opened = true,
  onToggle,
  label,
}: {
  children: ReactNode
  opened?: boolean
  onToggle?: () => void
  label: string
}) {
  return (
    <Pressable
      className={toggleStyles.toggle}
      aria-expanded={opened}
      aria-label={`${opened ? 'Collapse' : 'Expand'} ${label}`}
      disabled={!onToggle}
      onClick={onToggle}
      style={{
        borderRadius: 'var(--mantine-radius-sm)',
        marginBottom: opened ? 'var(--mantine-spacing-xs)' : 0,
      }}
    >
      <Group justify="space-between" wrap="nowrap" px={4} py={2}>
        <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
          {children}
        </Group>
        {opened ? (
          <IconChevronUp
            aria-hidden
            size={18}
            className={toggleStyles.chevron}
            style={{ flexShrink: 0 }}
          />
        ) : (
          <IconChevronDown
            aria-hidden
            size={18}
            className={toggleStyles.chevron}
            style={{ flexShrink: 0 }}
          />
        )}
      </Group>
    </Pressable>
  )
}
