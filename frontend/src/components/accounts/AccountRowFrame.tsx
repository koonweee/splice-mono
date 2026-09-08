import { Group } from '@mantine/core'
import styles from './AccountRow.module.css'
import type { ReactNode } from 'react'

export function AccountRowFrame({ children }: { children: ReactNode }) {
  return (
    <Group
      justify="space-between"
      className={styles.row}
      p="sm"
      gap="xs"
      wrap="nowrap"
    >
      {children}
    </Group>
  )
}
