import { Badge } from '@mantine/core'

const providerConfig: Partial<
  Record<string, { color: string; label: string }>
> = {
  plaid: { color: 'pink', label: 'Plaid' },
  simplefin: { color: 'violet', label: 'SimpleFIN' },
  crypto: { color: 'orange', label: 'Crypto' },
}

export function ProviderBadge({ provider }: { provider?: string }) {
  if (!provider) {
    return null
  }

  const config = providerConfig[provider] ?? { color: 'gray', label: provider }
  const role = providerConfig[provider]
    ? `provider-${provider}`
    : 'status-neutral'
  return (
    <Badge
      color={config.color}
      variant="light"
      c={`var(--splice-${role}-fg)`}
      bg={`var(--splice-${role}-bg)`}
    >
      {config.label}
    </Badge>
  )
}
