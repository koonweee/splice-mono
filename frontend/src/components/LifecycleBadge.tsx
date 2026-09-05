import { Badge, useComputedColorScheme } from '@mantine/core'
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
  const isLight = useComputedColorScheme() === 'light'
  const color =
    status === 'Active' ? 'green' : status === 'Paused' ? 'yellow' : 'gray'

  return (
    <Badge
      color={color}
      c={isLight ? `${color}.${color === 'gray' ? 7 : 9}` : undefined}
      variant="light"
      size={size}
      leftSection={leftSection}
      style={{ flexShrink: 0 }}
    >
      {children && <>{children} - </>}
      {status}
    </Badge>
  )
}
