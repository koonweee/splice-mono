import { Group, Paper, Text, Tooltip } from '@mantine/core'
import { AlertTriangle } from 'lucide-react'
import { accountConnectionWarning } from '../lib/connection-health'
import {
  formatAccountType,
  formatMoneyWithSign,
  getChangeColorMantine,
  resolveBalance,
} from '../lib/format'
import { ChangePercentPopover } from './ChangePercentPopover'
import styles from './AccountCard.module.css'
import type { AccountSummaryData } from '../lib/balance-utils'

export function AccountCard({
  account,
  isLiability,
  onClick,
}: {
  account: AccountSummaryData
  isLiability: boolean
  onClick?: () => void
}) {
  const { primaryBalance, originalBalance } = resolveBalance(
    account.effectiveBalance,
    account.convertedEffectiveBalance,
  )
  const warning = accountConnectionWarning(account)

  return (
    <Paper
      p="md"
      withBorder
      mih={94}
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
            <Text data-typography="rowTitle" truncate>
              {account.customName ?? account.name}
            </Text>
            {warning && (
              <Tooltip label={warning} withArrow>
                <AlertTriangle
                  aria-label="Account connection warning"
                  size={14}
                  color="var(--mantine-color-yellow-6)"
                />
              </Tooltip>
            )}
          </Group>
          <Text data-typography="metadata" c="dimmed" tt="capitalize" truncate>
            {account.institutionName
              ? `${account.institutionName} · ${formatAccountType(account.subType || account.type)}`
              : formatAccountType(account.subType || account.type)}
          </Text>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <Text data-typography="amount">
            {formatMoneyWithSign({ value: primaryBalance })}
          </Text>
          {originalBalance && (
            <Text data-typography="numericCaption" c="dimmed">
              {formatMoneyWithSign({
                value: originalBalance,
                appendCurrency: true,
              })}
            </Text>
          )}
          <ChangePercentPopover
            hideZero
            textRole="metadata"
            color={getChangeColorMantine(isLiability, account.changePercent)}
            changeAmount={account.changeAmount}
            changePercent={account.changePercent}
          />
        </div>
      </Group>
    </Paper>
  )
}
