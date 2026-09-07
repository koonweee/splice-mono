import { Modal } from '@mantine/core'
import { useAppTransitionGuard } from '../../lib/pwa/app-transition'
import styles from './EditorModal.module.css'
import type { ModalProps } from '@mantine/core'

/** A consistent editor surface: full screen on phones, bounded on larger screens. */
export function EditorModal({
  children,
  size = 'md',
  closeButtonProps,
  centered,
  ...props
}: ModalProps) {
  useAppTransitionGuard(props.opened)
  return (
    <Modal
      size={size}
      padding="lg"
      classNames={{
        content: styles.content,
        body: styles.body,
        inner: styles.inner,
        header: styles.header,
      }}
      {...props}
      fullScreen={false}
      centered={centered ?? true}
      closeButtonProps={{ 'aria-label': 'Close editor', ...closeButtonProps }}
    >
      {children}
    </Modal>
  )
}
