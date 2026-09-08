import { InteractiveRow } from './InteractiveRow'
import styles from './CompactAccountRow.module.css'
import type { ReactNode } from 'react'

export function CompactAccountRowFrame({
  label,
  onActivate,
  details,
  balance,
}: {
  label?: string
  onActivate?: () => void
  details: ReactNode
  balance: ReactNode
}) {
  return (
    <InteractiveRow
      actionLabel={label ?? 'Account details'}
      onActivate={onActivate}
      className={styles.row}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{details}</div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>{balance}</div>
    </InteractiveRow>
  )
}
