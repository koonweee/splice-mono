import { Collapse, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  CRYPTO_COLORS,
  CRYPTO_ICONS,
  getCryptoNetworkFromInstitution,
} from '../../lib/crypto-utils'
import {
  InstitutionAccountsFrame,
  InstitutionHeadingFrame,
} from './InstitutionSectionFrame'
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
      <InstitutionHeadingFrame
        label={institution}
        opened={opened}
        onToggle={toggle}
      >
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
      </InstitutionHeadingFrame>
      <Collapse in={opened}>
        <InstitutionAccountsFrame>
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </InstitutionAccountsFrame>
      </Collapse>
    </section>
  )
}
