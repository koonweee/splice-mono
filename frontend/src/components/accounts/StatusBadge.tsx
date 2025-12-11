import { Badge } from '@mantine/core'
import { AccountBankLinkStatus } from '../../api/models'

const statusConfig: Record<string, { color: string; label: string }> = {
  [AccountBankLinkStatus.OK]: { color: 'green', label: 'Connected' },
  [AccountBankLinkStatus.ERROR]: { color: 'red', label: 'Error' },
  [AccountBankLinkStatus.PENDING_REAUTH]: {
    color: 'yellow',
    label: 'Needs Reauth',
  },
}

export function StatusBadge({
  status,
}: {
  status?:
    | (typeof AccountBankLinkStatus)[keyof typeof AccountBankLinkStatus]
    | null
}) {
  if (!status) {
    return (
      <Badge color="gray" variant="light">
        Manual
      </Badge>
    )
  }

  const config = statusConfig[status] ?? { color: 'gray', label: status }
  return (
    <Badge color={config.color} variant="light">
      {config.label}
    </Badge>
  )
}
