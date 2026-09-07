import { Badge } from '@mantine/core'
import type { BadgeProps } from '@mantine/core'
import type { ReactNode } from 'react'

export type LifecycleStatus = 'Active' | 'Paused' | 'Archived' | 'Ended'

interface LifecycleBadgeProps extends Pick<BadgeProps, 'size' | 'leftSection'> {
  status: LifecycleStatus
  /** Optional item label; the lifecycle status is always included. */
  children?: ReactNode
}

/** Lifecycle states share theme success, warning, and neutral palettes. */
export function LifecycleBadge({
  status,
  children,
  size = 'sm',
  leftSection,
}: LifecycleBadgeProps) {
  const color =
    status === 'Active' ? 'green' : status === 'Paused' ? 'yellow' : 'gray'
  const role =
    status === 'Active'
      ? 'success'
      : status === 'Paused'
        ? 'warning'
        : 'neutral'

  return (
    <Badge
      color={color}
      c={`var(--splice-status-${role}-fg)`}
      variant="light"
      size={size}
      leftSection={leftSection}
      style={{ flexShrink: 0, background: `var(--splice-status-${role}-bg)` }}
    >
      {children && <>{children} - </>}
      {status}
    </Badge>
  )
}
