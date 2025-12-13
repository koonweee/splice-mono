import { Group, Text } from '@mantine/core'
import type { Account } from '../../api/models'
import { formatAccountType } from '../../lib/format'
import { StatusBadge } from './StatusBadge'

export function AccountRow({ account }: { account: Account }) {
  return (
    <Group
      justify="space-between"
      py="xs"
      px="sm"
      style={{
        borderBottom: '1px solid var(--mantine-color-gray-2)',
      }}
    >
      <div style={{ flex: 1 }}>
        <Text fw={500}>{account.name || 'Unnamed Account'}</Text>
        <Text size="sm" c="dimmed" tt="capitalize">
          {formatAccountType(account.subType || account.type)}
        </Text>
      </div>
      <StatusBadge status={account.bankLink?.status} />
    </Group>
  )
}
