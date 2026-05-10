import { Loader, Text } from '@mantine/core'
import styles from './MobileTableList.module.css'
import type { ReactNode } from 'react'

interface MobileTableListProps<T> {
  ariaLabel: string
  data: Array<T>
  emptyMessage: string
  errorMessage?: string
  footer?: ReactNode
  getRowKey: (row: T) => string
  isError?: boolean
  isLoading?: boolean
  renderRow: (row: T) => ReactNode
}

export function MobileTableList<T>({
  ariaLabel,
  data,
  emptyMessage,
  errorMessage = 'Error loading rows.',
  footer,
  getRowKey,
  isError = false,
  isLoading = false,
  renderRow,
}: MobileTableListProps<T>) {
  if (isLoading) {
    return (
      <div className={styles.footer}>
        <Loader size="sm" />
      </div>
    )
  }

  if (isError) {
    return (
      <Text c="red" size="sm">
        {errorMessage}
      </Text>
    )
  }

  if (data.length === 0) {
    return (
      <Text c="dimmed" size="sm" className={styles.state}>
        {emptyMessage}
      </Text>
    )
  }

  return (
    <div aria-label={ariaLabel} className={styles.list}>
      {data.map((row) => (
        <div className={styles.row} key={getRowKey(row)}>
          {renderRow(row)}
        </div>
      ))}
      {footer}
    </div>
  )
}
