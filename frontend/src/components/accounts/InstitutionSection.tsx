import { ActionIcon, Collapse, Group, Paper, Stack, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import type { Account } from '../../api/models'
import {
  CRYPTO_COLORS,
  CRYPTO_ICONS,
  getCryptoNetworkFromInstitution,
} from '../../lib/crypto-utils'
import { AccountRow } from './AccountRow'
import { ProviderBadge } from './ProviderBadge'

export function InstitutionSection({
  institution,
  accounts,
}: {
  institution: string
  accounts: Account[]
}) {
  const [opened, { toggle }] = useDisclosure(true)

  // Get provider from first account (all accounts in same institution share same provider)
  const provider = accounts[0]?.bankLink?.providerName
  const cryptoNetwork = getCryptoNetworkFromInstitution(institution)

  return (
    <Paper withBorder p="md" radius="md">
      <Group
        justify="space-between"
        mb={opened ? 'md' : 0}
        style={{ cursor: 'pointer' }}
        onClick={toggle}
      >
        <Group gap="sm">
          <Title order={3}>
            {cryptoNetwork && (
              <span style={{ color: CRYPTO_COLORS[cryptoNetwork], marginRight: 8 }}>
                {CRYPTO_ICONS[cryptoNetwork]}
              </span>
            )}
            {institution}
          </Title>
          <ProviderBadge provider={provider} />
        </Group>
        <ActionIcon variant="subtle" size="sm">
          {opened ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </ActionIcon>
      </Group>
      <Collapse in={opened}>
        <Stack gap="xs">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </Stack>
      </Collapse>
    </Paper>
  )
}
