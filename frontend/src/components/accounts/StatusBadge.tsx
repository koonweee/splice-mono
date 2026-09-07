import { Badge, Button, Group, Popover, Text } from '@mantine/core'
import type { SanitizedBankLinkStatusBody } from '@/api/models/sanitizedBankLinkStatusBody'
import { SanitizedBankLinkStatus } from '@/api/models/sanitizedBankLinkStatus'

const statusConfig: Record<string, { color: string; label: string }> = {
  [SanitizedBankLinkStatus.OK]: { color: 'green', label: 'Connected' },
  [SanitizedBankLinkStatus.ERROR]: { color: 'red', label: 'Error' },
  [SanitizedBankLinkStatus.PENDING_REAUTH]: {
    color: 'yellow',
    label: 'Needs reauthentication',
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
    const parts: Array<string> = []
    if (displayMessage) parts.push(displayMessage)
    else if (errorMessage) parts.push(errorMessage)
    if (suggestedAction) parts.push(suggestedAction)
    return parts.length > 0 ? parts.join('. ') : null
  }

  // PENDING_REAUTH (only remaining status after OK and ERROR checks above)
  const reason = statusBody.reason as string | undefined
  const expiration = statusBody.consent_expiration_time as string | undefined
  if (reason) return `Reason: ${reason}`
  if (expiration)
    return `Consent expires: ${new Date(expiration).toLocaleDateString()}`

  return null
}

interface StatusBadgeProps {
  status?: SanitizedBankLinkStatus
  statusBody?: SanitizedBankLinkStatusBody
  onFix?: () => void
}

export function StatusBadge({ status, statusBody, onFix }: StatusBadgeProps) {
  if (!status) {
    return (
      <Badge
        color="gray"
        variant="light"
        c="var(--splice-status-neutral-fg)"
        bg="var(--splice-status-neutral-bg)"
      >
        Manual
      </Badge>
    )
  }

  const config = statusConfig[status] ?? { color: 'gray', label: status }
  const role =
    status === SanitizedBankLinkStatus.OK
      ? 'success'
      : status === SanitizedBankLinkStatus.ERROR
        ? 'danger'
        : 'warning'
  const tooltipLabel = getTooltipLabel(status, statusBody)

  const badge = (
    <Badge
      color={config.color}
      c={`var(--splice-status-${role}-fg)`}
      bg={`var(--splice-status-${role}-bg)`}
      variant="light"
      style={{ cursor: tooltipLabel ? 'help' : undefined }}
    >
      {config.label}
    </Badge>
  )

  const renderedBadge = tooltipLabel ? (
    <Popover withinPortal withArrow position="bottom" shadow="md">
      <Popover.Target>
        <Button
          variant="transparent"
          px={0}
          h="auto"
          aria-label={`Show ${config.label.toLowerCase()} details`}
        >
          {badge}
        </Button>
      </Popover.Target>
      <Popover.Dropdown maw={300}>
        <Text data-typography="bodySmall">{tooltipLabel}</Text>
      </Popover.Dropdown>
    </Popover>
  ) : (
    badge
  )

  if (onFix && status !== SanitizedBankLinkStatus.OK) {
    return (
      <Group gap="xs">
        {renderedBadge}
        <Button size="compact-xs" variant="light" onClick={onFix}>
          Fix
        </Button>
      </Group>
    )
  }

  return renderedBadge
}
