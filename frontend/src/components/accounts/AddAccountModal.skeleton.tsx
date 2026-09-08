import { Stack } from '@mantine/core'
import { ACCOUNT_PROVIDERS } from './account-providers'
import { AccountProviderCard } from './AccountProviderCard'

export function AddAccountSkeleton() {
  return (
    <Stack gap="md" inert>
      {ACCOUNT_PROVIDERS.map((provider) => (
        <AccountProviderCard key={provider.id} provider={provider} disabled />
      ))}
    </Stack>
  )
}
