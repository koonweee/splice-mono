import { Badge, Button, Group, Popover, Text } from '@mantine/core'
import type { BankLinkHealth } from '@/api/models/bankLinkHealth'
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
  health?: BankLinkHealth | null
  onCheck?: () => void
  pending?: boolean
}

export function StatusBadge({
  status,
  statusBody,
  onFix,
  health,
  onCheck,
  pending,
}: StatusBadgeProps) {
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

  const delayed = status === 'OK' && health?.state === 'delayed'
  const unknown = status === 'OK' && health?.state === 'unknown'
  const config = delayed
    ? { color: 'yellow', label: 'Updates delayed' }
    : unknown
      ? { color: 'gray', label: 'Check unavailable' }
      : health?.reason === 'accounts_missing' && status !== 'OK'
        ? { color: 'red', label: 'Account unavailable' }
        : (statusConfig[status] ?? { color: 'gray', label: status })
  const role = delayed
    ? 'warning'
    : unknown
      ? 'neutral'
      : status === SanitizedBankLinkStatus.OK
        ? 'success'
        : status === SanitizedBankLinkStatus.ERROR
          ? 'danger'
          : 'warning'
  const tooltipLabel =
    getTooltipLabel(status, statusBody) ??
    (health?.state !== 'healthy' ? health?.message : null)

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
        <Button
          size="compact-xs"
          variant="light"
          onClick={onFix}
          loading={pending}
        >
          Fix
        </Button>
      </Group>
    )
  }

  if (onCheck && (delayed || unknown)) {
    return (
      <Group gap="xs">
        {renderedBadge}
        <Button
          size="compact-xs"
          variant="light"
          onClick={onCheck}
          loading={pending}
        >
          Check connection
        </Button>
      </Group>
    )
  }
  return renderedBadge
}
