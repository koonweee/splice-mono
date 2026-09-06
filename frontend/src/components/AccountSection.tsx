import { Collapse, Divider, Group, Paper, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { AccountType } from '../api/models'
import { compareIntegers, ratioPercent, signedMinorUnits } from '../lib/money'
import { CompactAccountRow } from './CompactAccountRow'
import { Pressable } from './Pressable'
import styles from './AccountSection.module.css'
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

function getGroupTotal(accounts: Array<AccountSummaryData>): bigint {
  return accounts.reduce(
    (sum, a) =>
      sum + signedMinorUnits(a.convertedEffectiveBalance ?? a.effectiveBalance),
    0n,
  )
}

function groupAccountsByType(accounts: Array<AccountSummaryData>): Array<{
  label: string
  accounts: Array<AccountSummaryData>
  percent: number
}> {
  const groupOrder = ['Investment', 'Depository', 'Other']
  const grouped = new Map<string, Array<AccountSummaryData>>()

  const sorted = [...accounts].sort((a, b) =>
    compareIntegers(
      signedMinorUnits(b.convertedEffectiveBalance ?? b.effectiveBalance),
      signedMinorUnits(a.convertedEffectiveBalance ?? a.effectiveBalance),
    ),
  )

  sorted.forEach((account) => {
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
      const percent = ratioPercent(groupTotal, totalAssets)
      return { label, accounts: groupAccounts, percent }
    })
}

export function AccountSection({
  title,
  accounts,
  balancesHidden,
  comparisonLoading,
  isLiability,
  onAccountClick,
}: {
  title: string
  accounts: Array<AccountSummaryData>
  balancesHidden: boolean
  comparisonLoading?: boolean
  isLiability: boolean
  onAccountClick: (account: AccountSummaryData) => void
}) {
  const [opened, { toggle }] = useDisclosure(true)
  const groups = isLiability ? null : groupAccountsByType(accounts)

  return (
    <>
      <Pressable
        className={styles.toggle}
        aria-expanded={opened}
        aria-label={`${opened ? 'Collapse' : 'Expand'} ${title}`}
        onClick={toggle}
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          marginBottom: 'var(--mantine-spacing-xs)',
        }}
      >
        <Group justify="space-between" px={4} py={2}>
          <Text size="sm" fw={600}>
            {title}
          </Text>
          {opened ? (
            <IconChevronUp size={16} className={styles.chevron} />
          ) : (
            <IconChevronDown size={16} className={styles.chevron} />
          )}
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
                      {groupIndex > 0 && (
                        <Divider className={styles.groupDivider} />
                      )}
                      <Group
                        className={styles.groupHeader}
                        justify="space-between"
                        px="sm"
                        py="xs"
                      >
                        <Text size="sm" fw={500} c="dimmed">
                          {group.label}
                        </Text>
                        <Text size="xs" fw={600} c="dimmed">
                          {group.percent.toFixed(1)}%
                        </Text>
                      </Group>
                      <Divider className={styles.groupHeaderDivider} />
                      {group.accounts.map((account, accountIndex) => (
                        <div key={account.id}>
                          {accountIndex > 0 && (
                            <Divider className={styles.accountDivider} />
                          )}
                          <CompactAccountRow
                            overview
                            account={account}
                            balancesHidden={balancesHidden}
                            comparisonLoading={comparisonLoading}
                            isLiability={isLiability}
                            onClick={() => onAccountClick(account)}
                          />
                        </div>
                      ))}
                    </div>
                  ))
                : accounts.map((account, index) => (
                    <div key={account.id}>
                      {index > 0 && (
                        <Divider className={styles.accountDivider} />
                      )}
                      <CompactAccountRow
                        overview
                        account={account}
                        balancesHidden={balancesHidden}
                        comparisonLoading={comparisonLoading}
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
