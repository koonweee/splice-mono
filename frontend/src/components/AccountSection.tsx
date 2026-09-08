import { Collapse, Divider, Group, Paper, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { AccountType } from '../api/models'
import { compareIntegers, ratioPercent, signedMinorUnits } from '../lib/money'
import {
  HIDDEN_BALANCE_PLACEHOLDER,
  formatMinorMoneyString,
} from '../lib/format'
import { PercentAmountPopover } from './PercentAmountPopover'
import toggleStyles from './SectionToggle.module.css'
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
  amount?: string
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
      const currencies = new Set(
        groupAccounts.map(
          (account) =>
            (account.convertedEffectiveBalance ?? account.effectiveBalance)
              .money.currency,
        ),
      )
      // A missing conversion must not present mixed currencies as one total.
      const currency = currencies.size === 1 ? [...currencies][0] : undefined
      const amount = currency
        ? formatMinorMoneyString({
            value: groupTotal.toString(),
            currency,
          })
        : undefined
      return { label, accounts: groupAccounts, percent, amount }
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
        className={toggleStyles.toggle}
        aria-expanded={opened}
        aria-label={`${opened ? 'Collapse' : 'Expand'} ${title}`}
        onClick={toggle}
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          marginBottom: 'var(--mantine-spacing-xs)',
        }}
      >
        <Group justify="space-between" px={4} py={2}>
          <Text data-typography="sectionHeading">{title}</Text>
          {opened ? (
            <IconChevronUp size={16} className={toggleStyles.chevron} />
          ) : (
            <IconChevronDown size={16} className={toggleStyles.chevron} />
          )}
        </Group>
      </Pressable>
      <Collapse in={opened}>
        {accounts.length === 0 ? (
          <Text data-typography="metadata" c="dimmed">
            No {title.toLowerCase()}
          </Text>
        ) : (
          <Paper withBorder p={0} className={styles.panel}>
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
                      >
                        <Text data-typography="label" c="dimmed">
                          {group.label}
                        </Text>
                        <PercentAmountPopover
                          percent={`${group.percent.toFixed(1)}%`}
                          amount={
                            balancesHidden
                              ? HIDDEN_BALANCE_PLACEHOLDER
                              : group.amount
                          }
                          label={`Show ${group.label.toLowerCase()} total`}
                          color="dimmed"
                          textRole="captionStrong"
                        />
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
