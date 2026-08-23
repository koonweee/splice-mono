import { Collapse, Divider, Group, Paper, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { AccountType } from '../api/models'
import { getSignedAmount } from '../lib/balance-utils'
import { CompactAccountRow } from './CompactAccountRow'
import { Pressable } from './Pressable'
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
  balancesHidden,
  isLiability,
  onAccountClick,
}: {
  title: string
  accounts: Array<AccountSummaryData>
  balancesHidden: boolean
  isLiability: boolean
  onAccountClick: (account: AccountSummaryData) => void
}) {
  const [opened, { toggle }] = useDisclosure(true)
  const groups = isLiability ? null : groupAccountsByType(accounts)

  return (
    <>
      <Pressable
        aria-expanded={opened}
        aria-label={`${opened ? 'Collapse' : 'Expand'} ${title}`}
        onClick={toggle}
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          marginBottom: 'var(--mantine-spacing-xs)',
        }}
      >
        <Group justify="space-between" px={4} py={2}>
          <Text size="sm" fw={700} tt="uppercase">
            {title}
          </Text>
          {opened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </Group>
      </Pressable>
      <Collapse in={opened}>
        {accounts.length === 0 ? (
          <Text c="dimmed" size="sm">
            No {title.toLowerCase()}
          </Text>
        ) : (
          <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
            <Stack gap={0}>
              {groups
                ? groups.map((group, groupIndex) => (
                    <div key={group.label}>
                      {groupIndex > 0 && <Divider />}
                      <Group
                        justify="space-between"
                        px="sm"
                        py="xs"
                        bg="var(--mantine-color-default-hover)"
                      >
                        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                          {group.label}
                        </Text>
                        <Text size="xs" fw={600} c="dimmed">
                          {group.percent.toFixed(1)}%
                        </Text>
                      </Group>
                      {group.accounts.map((account, accountIndex) => (
                        <div key={account.id}>
                          {accountIndex > 0 && <Divider />}
                          <CompactAccountRow
                            account={account}
                            balancesHidden={balancesHidden}
                            isLiability={isLiability}
                            onClick={() => onAccountClick(account)}
                          />
                        </div>
                      ))}
                    </div>
                  ))
                : accounts.map((account, index) => (
                    <div key={account.id}>
                      {index > 0 && <Divider />}
                      <CompactAccountRow
                        account={account}
                        balancesHidden={balancesHidden}
                        isLiability={isLiability}
                        onClick={() => onAccountClick(account)}
                      />
                    </div>
                  ))}
            </Stack>
          </Paper>
        )}
      </Collapse>
    </>
  )
}
