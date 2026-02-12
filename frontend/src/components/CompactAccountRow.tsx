import dayjs from 'dayjs'
import { Group, Text, Tooltip } from '@mantine/core'
import { AlertTriangle } from 'lucide-react'
import {
  formatAccountType,
  formatMoneyWithSign,
  formatPercent,
  formatRelativeTime,
  getChangeColorMantine,
  resolveBalance,
} from '../lib/format'
import styles from './CompactAccountRow.module.css'
import type { AccountSummaryData } from '../lib/balance-utils'

const STALE_THRESHOLD_DAYS = 7

function isSyncStale(syncedAt?: string): boolean {
  if (!syncedAt) return false
  return dayjs().diff(dayjs(syncedAt), 'day') >= STALE_THRESHOLD_DAYS
}

export function CompactAccountRow({
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
        <Text size="sm" fw={600}>
          {formatMoneyWithSign({ value: primaryBalance })}
        </Text>
        {originalBalance && (
          <Text size="xs" c="dimmed">
            {formatMoneyWithSign({ value: originalBalance, appendCurrency: true })}
          </Text>
        )}
        {changePercent && (
          <Text
            size="xs"
            c={getChangeColorMantine(isLiability, account.changePercent)}
          >
            {changePercent}
          </Text>
        )}
        {!originalBalance && (
          <Text size="xs" style={{ visibility: 'hidden' }}>{'\u00A0'}</Text>
        )}
      </div>
    </Group>
  )
}
