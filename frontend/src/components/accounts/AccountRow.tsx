import { Group, Text } from '@mantine/core'
import { SanitizedBankLinkStatus } from '../../api/models/sanitizedBankLinkStatus'
import { useBankLinkControllerInitiateLinking } from '../../api/clients/spliceAPI'
import { formatAccountType } from '../../lib/format'
import { StatusBadge } from './StatusBadge'
import type { Account } from '../../api/models'

export function AccountRow({ account }: { account: Account }) {
  const initiateLinking = useBankLinkControllerInitiateLinking()

  const needsFix =
    account.bankLink &&
    account.bankLink.status !== SanitizedBankLinkStatus.OK

  const handleFixConnection = needsFix
    ? () => {
        const redirectUri = window.location.href
        initiateLinking.mutate(
          {
            provider: account.bankLink!.providerName,
            data: { bankLinkId: account.bankLink!.id, redirectUri },
          },
          {
            onSuccess: (response) => {
              if (response.linkUrl) {
                window.location.href = response.linkUrl
              }
            },
          },
        )
      }
    : undefined

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
      <StatusBadge
        status={account.bankLink?.status}
        statusBody={account.bankLink?.statusBody}
        onFix={handleFixConnection}
      />
    </Group>
  )
}
