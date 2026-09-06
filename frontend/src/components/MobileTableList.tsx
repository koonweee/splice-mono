import { DataState } from './DataState'
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
  isFetching?: boolean
  loadingFallback?: ReactNode
  loadingMessage?: string
  onRetry?: () => void
  isRowSelected?: (row: T) => boolean
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
  isFetching = false,
  loadingMessage,
  loadingFallback,
  onRetry,
  isRowSelected,
  renderRow,
}: MobileTableListProps<T>) {
  return (
    <DataState
      hasData={data.length > 0}
      isLoading={isLoading}
      isError={isError}
      isFetching={isFetching}
      loadingMessage={loadingMessage}
      loadingFallback={loadingFallback}
      errorMessage={errorMessage}
      emptyMessage={emptyMessage}
      onRetry={onRetry}
    >
      <div aria-label={ariaLabel} className={styles.list} role="region">
        {data.map((row) => (
          <div
            className={styles.row}
            data-selected={isRowSelected?.(row) || undefined}
            key={getRowKey(row)}
          >
            {renderRow(row)}
          </div>
        ))}
        {footer}
      </div>
    </DataState>
  )
}
