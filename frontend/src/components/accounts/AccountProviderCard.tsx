import { Group, Loader, Text } from '@mantine/core'
import { Pressable } from '../Pressable'
import type { ACCOUNT_PROVIDERS } from './account-providers'

export function AccountProviderCard({
  provider,
  onClick,
  loading = false,
  disabled = false,
}: {
  provider: (typeof ACCOUNT_PROVIDERS)[number]
  onClick?: () => void
  loading?: boolean
  disabled?: boolean
}) {
  const Icon = provider.icon
  return (
    <Pressable
      aria-label={`Add account with ${provider.name}`}
      disabled={disabled}
      onClick={onClick}
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
        padding: 'var(--mantine-spacing-md)',
      }}
    >
      <Group>
        <Icon size={24} />
        <Text data-typography="rowTitle">{provider.name}</Text>
        {loading && <Loader size="sm" />}
      </Group>
    </Pressable>
  )
}
