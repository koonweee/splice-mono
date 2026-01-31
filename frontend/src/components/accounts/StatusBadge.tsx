import { Badge, Tooltip } from '@mantine/core'
import { SanitizedBankLinkStatus } from '@/api/models/sanitizedBankLinkStatus'
import type { SanitizedBankLinkStatusBody } from '@/api/models/sanitizedBankLinkStatusBody'

const statusConfig: Record<string, { color: string; label: string }> = {
  [SanitizedBankLinkStatus.OK]: { color: 'green', label: 'Connected' },
  [SanitizedBankLinkStatus.ERROR]: { color: 'red', label: 'Error' },
  [SanitizedBankLinkStatus.PENDING_REAUTH]: {
    color: 'yellow',
    label: 'Needs Reauth',
  },
}

function getTooltipLabel(
  status: SanitizedBankLinkStatus,
  statusBody?: SanitizedBankLinkStatusBody,
): string | null {
  if (status === SanitizedBankLinkStatus.OK) return null

  if (!statusBody) return null

  if (status === SanitizedBankLinkStatus.ERROR) {
    const displayMessage = statusBody.display_message as string | undefined
    const errorMessage = statusBody.error_message as string | undefined
    const suggestedAction = statusBody.suggested_action as string | undefined
    const parts: string[] = []
    if (displayMessage) parts.push(displayMessage)
    else if (errorMessage) parts.push(errorMessage)
    if (suggestedAction) parts.push(suggestedAction)
    return parts.length > 0 ? parts.join('. ') : null
  }

  if (status === SanitizedBankLinkStatus.PENDING_REAUTH) {
    const reason = statusBody.reason as string | undefined
    const expiration = statusBody.consent_expiration_time as string | undefined
    if (reason) return `Reason: ${reason}`
    if (expiration)
      return `Consent expires: ${new Date(expiration).toLocaleDateString()}`
  }

  return null
}

interface StatusBadgeProps {
  status?: SanitizedBankLinkStatus
  statusBody?: SanitizedBankLinkStatusBody
}

export function StatusBadge({ status, statusBody }: StatusBadgeProps) {
  if (!status) {
    return (
      <Badge color="gray" variant="light">
        Manual
      </Badge>
    )
  }

  const config = statusConfig[status] ?? { color: 'gray', label: status }
  const tooltipLabel = getTooltipLabel(status, statusBody)

  const badge = (
    <Badge
      color={config.color}
      variant="light"
      style={{ cursor: tooltipLabel ? 'help' : undefined }}
    >
      {config.label}
    </Badge>
  )

  if (tooltipLabel) {
    return (
      <Tooltip label={tooltipLabel} multiline maw={300} withArrow>
        {badge}
      </Tooltip>
    )
  }

  return badge
}
