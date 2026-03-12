import { ActionIcon, Group, Text, TextInput, Tooltip } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, RotateCcw, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { SanitizedBankLinkStatus } from '../../api/models/sanitizedBankLinkStatus'
import {
  getAccountControllerFindAllQueryKey,
  useAccountControllerUpdate,
  useBankLinkControllerInitiateLinking,
} from '../../api/clients/spliceAPI'
import { formatAccountType } from '../../lib/format'
import { StatusBadge } from './StatusBadge'
import type { Account } from '../../api/models'

export function AccountRow({ account }: { account: Account }) {
  const initiateLinking = useBankLinkControllerInitiateLinking()
  const updateAccount = useAccountControllerUpdate()
  const queryClient = useQueryClient()

  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState('')

  const displayName = account.customName ?? account.name ?? 'Unnamed Account'
  const isLinked = !!account.bankLinkId
  const isManual = !isLinked

  const startEditing = useCallback(() => {
    setEditedName(displayName)
    setIsEditing(true)
  }, [displayName])

  const cancelEditing = useCallback(() => {
    setIsEditing(false)
  }, [])

  const invalidateAccounts = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getAccountControllerFindAllQueryKey(),
    })
  }, [queryClient])

  const saveName = useCallback(() => {
    if (!editedName.trim()) return
    setIsEditing(false)

    if (isManual) {
      updateAccount.mutate(
        { id: account.id, data: { name: editedName } },
        { onSuccess: invalidateAccounts },
      )
    } else {
      const syncedName = account.name ?? ''
      const customName = editedName === syncedName ? null : editedName
      updateAccount.mutate(
        { id: account.id, data: { customName } },
        { onSuccess: invalidateAccounts },
      )
    }
  }, [account, editedName, isManual, updateAccount, invalidateAccounts])

  const resetToSyncedName = useCallback(() => {
    updateAccount.mutate(
      { id: account.id, data: { customName: null } },
      { onSuccess: invalidateAccounts },
    )
  }, [account, updateAccount, invalidateAccounts])

  const needsFix =
    account.bankLink && account.bankLink.status !== SanitizedBankLinkStatus.OK

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
        {isEditing ? (
          <Group gap="xs" wrap="nowrap">
            <TextInput
              value={editedName}
              onChange={(e) => setEditedName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') cancelEditing()
              }}
              size="sm"
              autoFocus
              style={{ flex: 1 }}
            />
            <ActionIcon
              variant="subtle"
              color="green"
              onClick={saveName}
              size="sm"
            >
              <Check size={14} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={cancelEditing}
              size="sm"
            >
              <X size={14} />
            </ActionIcon>
          </Group>
        ) : (
          <Group gap={6} wrap="nowrap">
            <Text fw={500}>{displayName}</Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={startEditing}
              size="sm"
            >
              <Pencil size={14} />
            </ActionIcon>
            {isLinked && account.customName && (
              <Tooltip
                label={`Reset to synced name: ${account.name}`}
                withArrow
              >
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={resetToSyncedName}
                  size="sm"
                >
                  <RotateCcw size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        )}
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
