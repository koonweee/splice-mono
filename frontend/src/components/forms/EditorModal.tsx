import { ResponsiveModal } from '../ResponsiveModal'
import { useAppTransitionGuard } from '../../lib/pwa/app-transition'
import styles from './EditorModal.module.css'
import type { ModalProps } from '@mantine/core'

/** A tall bottom sheet on compact viewports, bounded dialog on larger screens. */
export function EditorModal({
  children,
  size = 'md',
  closeButtonProps,
  centered,
  ...props
}: ModalProps) {
  useAppTransitionGuard(props.opened)
  return (
    <ResponsiveModal
      size={size}
      padding="lg"
      classNames={{
        content: styles.content,
        body: styles.body,
      }}
      {...props}
      centered={centered ?? true}
      closeButtonProps={{ 'aria-label': 'Close editor', ...closeButtonProps }}
    >
      {children}
    </ResponsiveModal>
  )
}
