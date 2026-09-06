import { useEffect, useState } from 'react'
import styles from './ResponsiveSlot.module.css'
import type { ReactNode } from 'react'

/** CSS chooses the first-paint surface. Retire the hidden SSR branch after
 * hydration, without remounting the visible branch or duplicating active forms. */
export function ResponsiveSlot({
  compact,
  variant,
  children,
  fill = false,
  breakpoint = 'compact',
}: {
  compact: boolean
  variant: 'compact' | 'wide'
  children: ReactNode
  fill?: boolean
  breakpoint?: 'compact' | 'data-list'
}) {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return (
    <div
      className={`${styles[variant]} ${fill ? styles.fill : ''} ${breakpoint === 'data-list' ? styles.dataList : ''}`}
    >
      {!hydrated || compact === (variant === 'compact') ? children : null}
    </div>
  )
}
