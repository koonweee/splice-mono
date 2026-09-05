import { Button, Group } from '@mantine/core'
import styles from './EditorModal.module.css'
import type { ReactNode } from 'react'

export function FormActions({
  onCancel,
  cancelDisabled = false,
  children,
}: {
  onCancel: () => void
  cancelDisabled?: boolean
  children: ReactNode
}) {
  return (
    <Group className={styles.actions} justify="flex-end" gap="sm" wrap="nowrap">
      <Button variant="default" onClick={onCancel} disabled={cancelDisabled}>
        Cancel
      </Button>
      {children}
    </Group>
  )
}
