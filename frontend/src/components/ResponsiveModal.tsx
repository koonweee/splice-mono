import { Modal } from '@mantine/core'
import { foundation } from '../lib/design-system/foundation'
import { useSheetLayout } from '../lib/responsive'
import type { ModalProps } from '@mantine/core'

/** Desktop dialog with the shared, CSS-sized bottom sheet on compact viewports. */
export function ResponsiveModal({ transitionProps, ...props }: ModalProps) {
  const compact = useSheetLayout()
  return (
    <Modal
      {...props}
      fullScreen={false}
      transitionProps={{
        duration: foundation.motion.overlay,
        ...transitionProps,
        transition: compact
          ? 'slide-up'
          : (transitionProps?.transition ?? 'pop'),
      }}
    />
  )
}
