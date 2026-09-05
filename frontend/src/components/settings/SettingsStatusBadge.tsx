import { Badge, useComputedColorScheme } from '@mantine/core'

export function SettingsStatusBadge({
  status,
}: {
  status: 'Active' | 'Paused' | 'Archived' | 'Ended'
}) {
  const isLight = useComputedColorScheme() === 'light'
  const color =
    status === 'Active' ? 'green' : status === 'Paused' ? 'orange' : 'gray'

  return (
    <Badge
      color={color}
      c={isLight ? `${color}.${color === 'gray' ? 7 : 9}` : undefined}
      variant="light"
      size="sm"
      style={{ flexShrink: 0 }}
    >
      {status}
    </Badge>
  )
}
