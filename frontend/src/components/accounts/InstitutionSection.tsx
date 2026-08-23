import { Collapse, Group, Paper, Stack, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import {
  CRYPTO_COLORS,
  CRYPTO_ICONS,
  getCryptoNetworkFromInstitution,
} from '../../lib/crypto-utils'
import { Pressable } from '../Pressable'
import { AccountRow } from './AccountRow'
import { ProviderBadge } from './ProviderBadge'
import type { Account } from '../../api/models'

export function InstitutionSection({
  institution,
  accounts,
}: {
  institution: string
  accounts: Array<Account>
}) {
  const [opened, { toggle }] = useDisclosure(true)

  // Get provider from first account (all accounts in same institution share same provider)
  const provider = accounts[0]?.bankLink?.providerName
  const cryptoNetwork = getCryptoNetworkFromInstitution(institution)

  return (
    <Paper withBorder p="md" radius="md">
      <Pressable
        aria-expanded={opened}
        aria-label={`${opened ? 'Collapse' : 'Expand'} ${institution}`}
        onClick={toggle}
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          marginBottom: opened ? 'var(--mantine-spacing-md)' : 0,
        }}
      >
        <Group justify="space-between" px={4} py={2}>
          <Group gap="sm">
            <Title order={3}>
              {cryptoNetwork && (
                <span
                  style={{
                    color: CRYPTO_COLORS[cryptoNetwork],
                    marginRight: 8,
                  }}
                >
                  {CRYPTO_ICONS[cryptoNetwork]}
                </span>
              )}
              {institution}
            </Title>
            <ProviderBadge provider={provider} />
          </Group>
          {opened ? (
            <IconChevronUp aria-hidden size={18} />
          ) : (
            <IconChevronDown aria-hidden size={18} />
          )}
        </Group>
      </Pressable>
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
