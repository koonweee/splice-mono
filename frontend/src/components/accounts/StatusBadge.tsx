import { SanitizedBankLinkStatus } from '@/api/models/sanitizedBankLinkStatus'
import { Badge } from '@mantine/core'

const statusConfig: Record<string, { color: string; label: string }> = {
  [SanitizedBankLinkStatus.OK]: { color: 'green', label: 'Connected' },
  [SanitizedBankLinkStatus.ERROR]: { color: 'red', label: 'Error' },
  [SanitizedBankLinkStatus.PENDING_REAUTH]: {
    color: 'yellow',
    label: 'Needs Reauth',
  },
}

export function StatusBadge({ status }: { status?: SanitizedBankLinkStatus }) {
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
