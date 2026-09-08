import { Box, Group, Text } from '@mantine/core'
import { Plus } from 'lucide-react'
import { useContext } from 'react'
import { createPortal } from 'react-dom'
import { PageActionTarget } from '../../lib/page-layout-context'
import { PageActions } from '../PageActions'
import styles from './SettingsToolbar.module.css'
import type { PageAction } from '../PageActions'
import type { ReactNode } from 'react'

export function SettingsToolbar({
  title,
  description,
  addLabel,
  onAdd,
  hideAdd = false,
  disabled = false,
  children,
  secondary,
}: {
  title: string
  description: string
  addLabel: string
  onAdd: () => void
  hideAdd?: boolean
  disabled?: boolean
  secondary?: Array<PageAction>
  children?: ReactNode
}) {
  const pageActionTarget = useContext(PageActionTarget)
  const actions = (
    <PageActions
      primary={
        hideAdd
          ? undefined
          : {
              id: 'add-section',
              disabled,
              label: addLabel,
              icon: Plus,
              onClick: onAdd,
            }
      }
      secondary={secondary}
    />
  )
  const pageAction = pageActionTarget
    ? createPortal(actions, pageActionTarget)
    : null
  return (
    <Group align="flex-start" justify="space-between" gap="md" wrap="wrap">
      {pageAction}
      <Box className={styles.heading}>
        <Text data-typography="sectionHeading">{title}</Text>
        <Text data-typography="metadata" c="dimmed">
          {description}
        </Text>
      </Box>
      {((pageActionTarget === undefined && (!hideAdd || secondary?.length)) ||
        children) && (
        <Group className={styles.actions} gap="xs" wrap="wrap">
          {pageActionTarget === undefined && actions}
          {children}
        </Group>
      )}
    </Group>
  )
}
