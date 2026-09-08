import { Group } from '@mantine/core'
import { PageToolbar } from '../PageLayout'
import styles from './SettingsFiltersFrame.module.css'
import type { ReactNode } from 'react'

export function SettingsFiltersFrame({
  children,
  categories = false,
  inline = false,
}: {
  children: ReactNode
  categories?: boolean
  inline?: boolean
}) {
  const content = (
    <Group
      w="100%"
      align={categories ? 'center' : undefined}
      gap="xs"
      className={`${styles.filters} ${categories ? styles.categories : ''}`}
    >
      {children}
    </Group>
  )
  return inline ? content : <PageToolbar section>{content}</PageToolbar>
}
