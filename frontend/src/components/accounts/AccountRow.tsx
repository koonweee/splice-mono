import { Group, Text } from '@mantine/core'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { AccountWithConvertedBalance } from '../../api/models'
import { StatusBadge } from './StatusBadge'

dayjs.extend(relativeTime)

export function AccountRow({ account }: { account: AccountWithConvertedBalance }) {
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
          {account.subType || account.type}
        </Text>
      </div>
      <Group gap="md">
        <StatusBadge status={account.bankLink?.status} />
        <Text size="sm" c="dimmed" style={{ minWidth: 80, textAlign: 'right' }}>
          {account.lastSyncedAt ? dayjs(account.lastSyncedAt).fromNow() : '-'}
        </Text>
      </Group>
    </Group>
  )
}
