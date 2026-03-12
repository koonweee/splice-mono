import { ActionIcon, Collapse, Group, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { AccountType } from '../api/models'
import { getSignedAmount } from '../lib/balance-utils'
import { AccountCard } from './AccountCard'
import type { AccountSummaryData } from '../lib/balance-utils'

const ASSET_TYPE_LABELS: Record<string, string> = {
  [AccountType.investment]: 'Investment',
  [AccountType.brokerage]: 'Investment',
  [AccountType.depository]: 'Depository',
  [AccountType.crypto_wallet]: 'Investment',
  [AccountType.other]: 'Other',
}

function getAssetTypeGroup(type: string): string {
  return ASSET_TYPE_LABELS[type] ?? 'Other'
}

function getGroupTotal(accounts: Array<AccountSummaryData>): number {
  return accounts.reduce(
    (sum, a) =>
      sum + getSignedAmount(a.convertedEffectiveBalance ?? a.effectiveBalance),
    0,
  )
}

function groupAccountsByType(accounts: Array<AccountSummaryData>): Array<{
  label: string
  accounts: Array<AccountSummaryData>
  percent: number
}> {
  const groupOrder = ['Investment', 'Depository', 'Other']
  const grouped = new Map<string, Array<AccountSummaryData>>()

  accounts.sort(
    (a, b) =>
      getSignedAmount(b.convertedEffectiveBalance ?? b.effectiveBalance) -
      getSignedAmount(a.convertedEffectiveBalance ?? a.effectiveBalance),
  )

  accounts.forEach((account) => {
    const group = getAssetTypeGroup(account.type)
    const existing = grouped.get(group) ?? []
    existing.push(account)
    grouped.set(group, existing)
  })

  const totalAssets = getGroupTotal(accounts)

  return groupOrder
    .filter((label) => grouped.has(label))
    .map((label) => {
      const groupAccounts = grouped.get(label)!
      const groupTotal = getGroupTotal(groupAccounts)
      const percent = totalAssets === 0 ? 0 : (groupTotal / totalAssets) * 100
      return { label, accounts: groupAccounts, percent }
    })
}

export function AccountSection({
  title,
  accounts,
  isLiability,
  onAccountClick,
}: {
  title: string
  accounts: Array<AccountSummaryData>
  isLiability: boolean
  onAccountClick: (account: AccountSummaryData) => void
}) {
  const [opened, { toggle }] = useDisclosure(true)
  const groups = isLiability ? null : groupAccountsByType(accounts)

  return (
    <>
      <Group
        justify="space-between"
        mb="md"
        style={{ cursor: 'pointer' }}
        onClick={toggle}
      >
        <Title order={3}>{title}</Title>
        <ActionIcon variant="subtle" size="sm">
          {opened ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </ActionIcon>
      </Group>
      <Collapse in={opened}>
        <Stack gap="sm">
          {accounts.length === 0 ? (
            <Text c="dimmed">No {title.toLowerCase()}</Text>
          ) : groups ? (
            groups.map((group) => (
              <Stack key={group.label} gap="xs">
                <Group justify="space-between" px="xs">
                  <Text size="sm" fw={600} c="dimmed" tt="uppercase">
                    {group.label}
                  </Text>
                  <Text size="sm" fw={600} c="dimmed">
                    {group.percent.toFixed(1)}%
                  </Text>
                </Group>
                {group.accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    isLiability={isLiability}
                    onClick={() => onAccountClick(account)}
                  />
                ))}
              </Stack>
            ))
          ) : (
            accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                isLiability={isLiability}
                onClick={() => onAccountClick(account)}
              />
            ))
          )}
        </Stack>
      </Collapse>
    </>
  )
}
