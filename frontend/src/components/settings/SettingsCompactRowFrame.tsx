import styles from './SettingsCompactRow.module.css'
import type { ReactNode } from 'react'

export function SettingsCompactRowFrame({
  heading,
  children,
}: {
  heading: ReactNode
  children: ReactNode
}) {
  return (
    <div className={styles.row}>
      <div className={styles.heading}>{heading}</div>
      {children}
    </div>
  )
}
