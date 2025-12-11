import { Group, Paper, Text } from '@mantine/core'
import type { AccountSummaryData } from '../lib/balance-utils'
import {
  formatMoneyWithSign,
  formatPercent,
  resolveBalance,
} from '../lib/format'
import styles from './AccountCard.module.css'

function getChangeColorMantine(
  changePercent: number | null,
  isLiability: boolean,
): string {
  if (changePercent === null) return 'dimmed'
  const isPositive = changePercent > 0
  const isGood = isLiability ? !isPositive : isPositive
  return isGood ? 'teal' : 'red'
}

export function AccountCard({
  account,
  isLiability,
  onClick,
}: {
  account: AccountSummaryData
  isLiability: boolean
  onClick?: () => void
}) {
  const changePercent = formatPercent(account.changePercent)
  const { primaryBalance, originalBalance } = resolveBalance(
    account.effectiveBalance,
    account.convertedEffectiveBalance,
  )

  return (
    <Paper
      p="md"
      withBorder
      h={94}
      className={onClick ? styles.clickable : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        cursor: onClick ? 'pointer' : undefined,
      }}
      onClick={onClick}
    >
      <Group
        justify="space-between"
        align="center"
        style={{ width: '100%' }}
        wrap="nowrap"
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text fw={500} truncate>
            {account.name || 'Unnamed Account'}
          </Text>
          <Text size="sm" c="dimmed" tt="capitalize" truncate>
            {account.institutionName
              ? `${account.institutionName} · ${account.subType || account.type}`
              : account.subType || account.type}
          </Text>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <Text fw={600}>{formatMoneyWithSign({ value: primaryBalance })}</Text>
          {originalBalance && (
            <Text size="xs" c="dimmed">
              {formatMoneyWithSign({
                value: originalBalance,
                appendCurrency: true,
              })}
            </Text>
          )}
          {changePercent && (
            <Text
              size="sm"
              c={getChangeColorMantine(account.changePercent, isLiability)}
            >
              {changePercent}
            </Text>
          )}
        </div>
      </Group>
    </Paper>
  )
}
