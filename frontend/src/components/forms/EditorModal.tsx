import { Modal } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import styles from './EditorModal.module.css'
import type { ModalProps } from '@mantine/core'

/** A consistent editor surface: full screen on phones, bounded on larger screens. */
export function EditorModal({
  children,
  size = 'md',
  closeButtonProps,
  ...props
}: ModalProps) {
  const isPhone = useMediaQuery('(max-width: 36em)')

  return (
    <Modal
      size={size}
      padding="lg"
      classNames={{ content: styles.content, body: styles.body }}
      {...props}
      fullScreen={isPhone}
      centered={!isPhone}
      closeButtonProps={{ 'aria-label': 'Close editor', ...closeButtonProps }}
    >
      {children}
    </Modal>
  )
}
