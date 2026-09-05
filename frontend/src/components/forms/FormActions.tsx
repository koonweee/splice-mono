import { Button, Group } from '@mantine/core'
import styles from './EditorModal.module.css'
import type { ReactNode } from 'react'

export function FormActions({
  onCancel,
  cancelDisabled = false,
  autoFocusCancel = false,
  children,
}: {
  onCancel: () => void
  cancelDisabled?: boolean
  autoFocusCancel?: boolean
  children: ReactNode
}) {
  return (
    <Group className={styles.actions} justify="flex-end" gap="sm" wrap="nowrap">
      <Button
        type="button"
        variant="default"
        onClick={onCancel}
        disabled={cancelDisabled}
        data-autofocus={autoFocusCancel || undefined}
      >
        Cancel
      </Button>
      {children}
    </Group>
  )
}
