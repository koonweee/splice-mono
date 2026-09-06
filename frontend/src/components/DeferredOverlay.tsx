import { Box, Drawer, Modal, Stack } from '@mantine/core'
import { useCompactLayout } from '../lib/responsive'
import styles from './DeferredOverlay.module.css'
import { DeferredFeature } from './DeferredFeature'
import { EditorModal } from './forms/EditorModal'
import { FormSkeleton, LoadingSkeleton } from './loading/LoadingSkeleton'
import drilldownStyles from './CategoryTransactionsModal.module.css'
import type { ReactNode } from 'react'
import type { ModalProps } from '@mantine/core'

/** A lazy overlay owns its loading and failure inside the same closeable frame. */
export function DeferredOverlay({
  children,
  label,
  title = label,
  onClose,
  size,
  centered,
  kind = 'editor',
  skeleton = <FormSkeleton />,
  minHeight = 300,
  header,
}: {
  children: ReactNode
  label: string
  title?: string
  onClose: () => void
  size?: ModalProps['size']
  centered?: boolean
  kind?: 'editor' | 'drilldown' | 'audit'
  skeleton?: ReactNode
  minHeight?: number
  header?: ReactNode
}) {
  const isCompact = useCompactLayout()
  const frame = (content: ReactNode) => {
    const body = (
      <Box mih={minHeight} className={styles.body}>
        {content}
      </Box>
    )
    if (kind === 'audit')
      return (
        <Drawer
          opened
          onClose={onClose}
          title={title}
          position={isCompact ? 'bottom' : 'right'}
          size={isCompact ? 'min(92dvh, 720px)' : 560}
          padding="md"
          styles={{
            content: { display: 'flex', flexDirection: 'column' },
            body: { flex: 1, minHeight: 0, overflow: 'hidden' },
          }}
        >
          {header ? (
            <Stack gap="md" h="100%" style={{ minHeight: 0 }}>
              {header}
              {body}
            </Stack>
          ) : (
            body
          )}
        </Drawer>
      )
    if (kind === 'drilldown')
      return (
        <Modal
          opened
          onClose={onClose}
          title={title}
          size={1200}
          fullScreen={isCompact}
          classNames={{
            body: drilldownStyles.drilldownModalBody,
            content: drilldownStyles.drilldownModalContent,
          }}
          transitionProps={{ transition: 'fade', duration: 200 }}
        >
          {body}
        </Modal>
      )
    return (
      <EditorModal
        opened
        onClose={onClose}
        title={title}
        size={size}
        centered={centered}
      >
        {body}
      </EditorModal>
    )
  }
  return (
    <DeferredFeature
      label={label}
      fallback={frame(
        <LoadingSkeleton label={`Loading ${label.toLowerCase()}…`}>
          {skeleton}
        </LoadingSkeleton>,
      )}
      errorFallback={(error) =>
        frame(
          <Box pos="relative">
            <div
              aria-hidden="true"
              style={{ visibility: 'hidden', pointerEvents: 'none' }}
            >
              {skeleton}
            </div>
            <Box pos="absolute" inset={0}>
              {error}
            </Box>
          </Box>,
        )
      }
    >
      {children}
    </DeferredFeature>
  )
}
