import dayjs from 'dayjs'
import { Group, Paper, Text, Tooltip } from '@mantine/core'
import { AlertTriangle } from 'lucide-react'
import {
  formatAccountType,
  formatMoneyWithSign,
  formatPercent,
  formatRelativeTime,
  getChangeColorMantine,
  resolveBalance,
} from '../lib/format'
import styles from './AccountCard.module.css'
import type { AccountSummaryData } from '../lib/balance-utils'

const STALE_THRESHOLD_DAYS = 7

function isSyncStale(syncedAt?: string): boolean {
  if (!syncedAt) return false
  return dayjs().diff(dayjs(syncedAt), 'day') >= STALE_THRESHOLD_DAYS
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
  const stale = isSyncStale(account.syncedAt)

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
          <Group gap={6} wrap="nowrap">
            <Text fw={500} truncate>
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
                />
              </Tooltip>
            )}
          </Group>
          <Text size="sm" c="dimmed" tt="capitalize" truncate>
            {account.institutionName
              ? `${account.institutionName} · ${formatAccountType(account.subType || account.type)}`
              : formatAccountType(account.subType || account.type)}
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
              c={getChangeColorMantine(isLiability, account.changePercent)}
            >
              {changePercent}
            </Text>
          )}
        </div>
      </Group>
    </Paper>
  )
}
