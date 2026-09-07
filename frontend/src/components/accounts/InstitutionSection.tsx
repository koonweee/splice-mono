import { Collapse, Group, Paper, Stack, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import {
  CRYPTO_COLORS,
  CRYPTO_ICONS,
  getCryptoNetworkFromInstitution,
} from '../../lib/crypto-utils'
import { Pressable } from '../Pressable'
import toggleStyles from '../SectionToggle.module.css'
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
    <section>
      <Pressable
        className={toggleStyles.toggle}
        aria-expanded={opened}
        aria-label={`${opened ? 'Collapse' : 'Expand'} ${institution}`}
        onClick={toggle}
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          marginBottom: opened ? 'var(--mantine-spacing-xs)' : 0,
        }}
      >
        <Group justify="space-between" wrap="nowrap" px={4} py={2}>
          <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
            <Title
              data-typography="sectionHeading"
              order={3}
              style={{ minWidth: 0, overflowWrap: 'anywhere' }}
            >
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
            <IconChevronUp
              aria-hidden
              size={18}
              className={toggleStyles.chevron}
              style={{ flexShrink: 0 }}
            />
          ) : (
            <IconChevronDown
              aria-hidden
              size={18}
              className={toggleStyles.chevron}
              style={{ flexShrink: 0 }}
            />
          )}
        </Group>
      </Pressable>
      <Collapse in={opened}>
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          <Stack gap={0}>
            {accounts.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </Stack>
        </Paper>
      </Collapse>
    </section>
  )
}
