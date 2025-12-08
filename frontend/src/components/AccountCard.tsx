import { Group, Paper, Text } from '@mantine/core'
import type { AccountSummary } from '../api/models'
import { formatMoneyWithSign, formatPercent } from '../lib/format'

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
}: {
  account: AccountSummary
  isLiability: boolean
}) {
  const changePercent = formatPercent(account.changePercent)

  return (
    <Paper p="md" withBorder>
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={500}>{account.name || 'Unnamed Account'}</Text>
          <Text size="sm" c="dimmed" tt="capitalize">
            {account.subType || account.type}
          </Text>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Text fw={600}>{formatMoneyWithSign(account.currentBalance)}</Text>
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
