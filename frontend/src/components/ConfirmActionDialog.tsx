import { Alert, Button, Modal, Stack, Text } from '@mantine/core'
import { FormActions } from './forms/FormActions'
import type { ReactNode } from 'react'

export type ConfirmActionDialogProps = {
  opened: boolean
  title: string
  targetLabel: string
  consequence: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  isPending?: boolean
  error?: string | null
}

/** Callers own the mutation and close the dialog after it succeeds. */
export function ConfirmActionDialog({
  opened,
  title,
  targetLabel,
  consequence,
  confirmLabel,
  onConfirm,
  onClose,
  isPending = false,
  error,
}: ConfirmActionDialogProps) {
  const close = () => {
    if (!isPending) onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={title}
      centered
      size="sm"
      padding="lg"
      closeOnClickOutside={!isPending}
      closeOnEscape={!isPending}
      closeButtonProps={{
        'aria-label': 'Close confirmation',
        disabled: isPending,
      }}
    >
      <Stack gap="sm">
        <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
          {targetLabel}
        </Text>
        <Text component="div" size="sm">
          {consequence}
        </Text>
        {error && (
          <Alert color="red" role="alert" title="Action failed">
            {error}
          </Alert>
        )}
        <FormActions
          onCancel={close}
          cancelDisabled={isPending}
          autoFocusCancel
        >
          <Button
            color="red"
            loading={isPending}
            onClick={() => {
              if (!isPending) onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </FormActions>
      </Stack>
    </Modal>
  )
}
