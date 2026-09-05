import { Box, Button, Group, Text } from '@mantine/core'
import { Plus } from 'lucide-react'
import styles from './SettingsToolbar.module.css'
import type { ReactNode } from 'react'

export function SettingsToolbar({
  title,
  description,
  addLabel,
  onAdd,
  hideAdd = false,
  children,
}: {
  title: string
  description: string
  addLabel: string
  onAdd: () => void
  hideAdd?: boolean
  children?: ReactNode
}) {
  return (
    <Group align="flex-start" justify="space-between" gap="md" wrap="wrap">
      <Box className={styles.heading}>
        <Text fw={700} size="lg">
          {title}
        </Text>
        <Text c="dimmed" size="sm">
          {description}
        </Text>
      </Box>
      {(!hideAdd || children) && (
        <Group className={styles.actions} gap="xs" wrap="wrap">
          {!hideAdd && (
            <Button leftSection={<Plus size={16} />} onClick={onAdd}>
              {addLabel}
            </Button>
          )}
          {children}
        </Group>
      )}
    </Group>
  )
}
