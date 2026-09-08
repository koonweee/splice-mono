import { Box, VisuallyHidden } from '@mantine/core'
import { createContext, useContext } from 'react'
import styles from './LoadingSkeleton.module.css'
import type { ReactNode } from 'react'

const LoadingRegion = createContext(false)

/** One announcement per boundary; shapes never expose fake values or controls. */
export function LoadingSkeleton({
  children,
  label = 'Loading results…',
}: {
  children: ReactNode
  label?: string
}) {
  const nested = useContext(LoadingRegion)
  if (nested) return <>{children}</>
  return (
    <Box
      role="status"
      aria-label={label.replace(/…$/, '')}
      aria-busy="true"
      className={styles.root}
    >
      <VisuallyHidden>{label}</VisuallyHidden>
      <LoadingRegion.Provider value>
        <div aria-hidden="true" inert className={styles.content}>
          {children}
        </div>
      </LoadingRegion.Provider>
    </Box>
  )
}
