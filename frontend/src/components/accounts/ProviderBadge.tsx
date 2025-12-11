import { Badge } from '@mantine/core'

const providerConfig: Record<string, { color: string; label: string }> = {
  plaid: { color: 'pink', label: 'Plaid' },
  simplefin: { color: 'violet', label: 'SimpleFIN' },
}

export function ProviderBadge({ provider }: { provider?: string | null }) {
  if (!provider) {
    return null
  }

  const config = providerConfig[provider] ?? { color: 'gray', label: provider }
  return (
    <Badge color={config.color} variant="light">
      {config.label}
    </Badge>
  )
}
