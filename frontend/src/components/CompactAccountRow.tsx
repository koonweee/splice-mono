import dayjs from 'dayjs'
import { Group, Text, Tooltip } from '@mantine/core'
import { AlertTriangle } from 'lucide-react'
import {
  HIDDEN_BALANCE_PLACEHOLDER,
  formatAccountType,
  formatMoneyWithSign,
  formatRelativeTime,
  getChangeColorMantine,
  resolveBalance,
} from '../lib/format'
import { ChangePercentPopover } from './ChangePercentPopover'
import styles from './CompactAccountRow.module.css'
import type { AccountSummaryData } from '../lib/balance-utils'

const STALE_THRESHOLD_DAYS = 7

function isSyncStale(syncedAt?: string): boolean {
  if (!syncedAt) return false
  return dayjs().diff(dayjs(syncedAt), 'day') >= STALE_THRESHOLD_DAYS
}

export function CompactAccountRow({
  account,
  balancesHidden,
  isLiability,
  onClick,
}: {
  account: AccountSummaryData
  balancesHidden: boolean
  isLiability: boolean
  onClick?: () => void
}) {
  const { primaryBalance, originalBalance } = resolveBalance(
    account.effectiveBalance,
    account.convertedEffectiveBalance,
  )
  const stale = isSyncStale(account.syncedAt)

  return (
    <Group
      justify="space-between"
      align="center"
      wrap="nowrap"
      py="sm"
      px="sm"
      className={onClick ? styles.clickable : undefined}
      style={{ cursor: onClick ? 'pointer' : undefined }}
      onClick={onClick}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={500} truncate>
            {account.customName ?? account.name}
          </Text>
          {stale && (
            <Tooltip
              label={`Last synced ${formatRelativeTime(new Date(account.syncedAt ?? ''))}`}
              withArrow
            >
              <AlertTriangle
                size={14}
                color="var(--mantine-color-yellow-6)"
                style={{ flexShrink: 0 }}
              />
            </Tooltip>
          )}
        </Group>
        <Text size="xs" c="dimmed" tt="capitalize" truncate>
          {account.institutionName
            ? `${account.institutionName} · ${formatAccountType(account.subType || account.type)}`
            : formatAccountType(account.subType || account.type)}
        </Text>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <Text size="sm" fw={600} data-testid="account-primary-balance">
          {balancesHidden
            ? HIDDEN_BALANCE_PLACEHOLDER
            : formatMoneyWithSign({ value: primaryBalance })}
        </Text>
        {originalBalance && (
          <Text size="xs" c="dimmed" data-testid="account-original-balance">
            {balancesHidden
              ? HIDDEN_BALANCE_PLACEHOLDER
              : formatMoneyWithSign({
                  value: originalBalance,
                  appendCurrency: true,
                })}
          </Text>
        )}
        <ChangePercentPopover
          size="xs"
          color={getChangeColorMantine(isLiability, account.changePercent)}
          changeAmount={account.changeAmount}
          changePercent={account.changePercent}
          hidden={balancesHidden}
          testId="account-change-percent"
        />
        {!originalBalance && (
          <Text size="xs" style={{ visibility: 'hidden' }}>
            {'\u00A0'}
          </Text>
        )}
      </div>
    </Group>
  )
}
