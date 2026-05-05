import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, Check, Link2, Pencil, RotateCcw, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { SanitizedBankLinkStatus } from '../../api/models/sanitizedBankLinkStatus'
import {
  getAccountControllerFindAllQueryKey,
  getBalanceQueryControllerGetAllBalancesQueryKey,
  getBalanceQueryControllerGetBalancesQueryKey,
  useAccountControllerUpdate,
  useBankLinkControllerInitiateLinking,
} from '../../api/clients/spliceAPI'
import { axios } from '../../api/axios'
import {
  formatAccountType,
  formatRelativeTime,
} from '../../lib/format'
import { StatusBadge } from './StatusBadge'
import type { Account } from '../../api/models'

function archiveAccountById(id: string): Promise<Account> {
  return axios<Account>({ url: `/account/${id}/archive`, method: 'POST' })
}

export function AccountRow({ account }: { account: Account }) {
  const initiateLinking = useBankLinkControllerInitiateLinking()
  const updateAccount = useAccountControllerUpdate()
  const archiveAccount = useMutation({
    mutationFn: ({ id }: { id: string }) => archiveAccountById(id),
  })
  const queryClient = useQueryClient()

  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [archiveModalOpened, setArchiveModalOpened] = useState(false)

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

  const invalidateAccountBalances = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getBalanceQueryControllerGetBalancesQueryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: getBalanceQueryControllerGetAllBalancesQueryKey(),
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

  const handleArchive = useCallback(() => {
    archiveAccount.mutate(
      { id: account.id },
      {
        onSuccess: () => {
          invalidateAccounts()
          invalidateAccountBalances()
          notifications.show({
            title: 'Account Archived',
            message: 'The account has been hidden and its balance set to zero.',
            color: 'green',
          })
          setArchiveModalOpened(false)
        },
        onError: () => {
          notifications.show({
            title: 'Archive Failed',
            message: 'Unable to archive this account. Please try again.',
            color: 'red',
          })
        },
      },
    )
  }, [account.id, archiveAccount, invalidateAccountBalances, invalidateAccounts])

  const needsFix =
    account.bankLink && account.bankLink.status !== SanitizedBankLinkStatus.OK

  const getPlaidRedirectUri = useCallback(
    () => window.location.href.replace(/^http:/, 'https:'),
    [],
  )

  const handleFixConnection = needsFix
    ? () => {
        const redirectUri = getPlaidRedirectUri()
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

  const handleConvertToLinked = isManual
    ? () => {
        initiateLinking.mutate(
          {
            provider: 'plaid',
            data: {
              redirectUri: getPlaidRedirectUri(),
              convertAccountId: account.id,
            },
          },
          {
            onSuccess: (response) => {
              if (response.linkUrl) {
                window.location.href = response.linkUrl
              }
            },
            onError: () => {
              notifications.show({
                title: 'Link Failed',
                message: 'Unable to start Plaid linking for this account.',
                color: 'red',
              })
            },
          },
        )
      }
    : undefined

  return (
    <>
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
                size="md"
                autoFocus
                style={{ flex: 1 }}
              />
              <ActionIcon
                variant="subtle"
                color="green"
                onClick={saveName}
                size="sm"
                aria-label="Save account name"
              >
                <Check size={14} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={cancelEditing}
                size="sm"
                aria-label="Cancel account name edit"
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
                aria-label="Edit account name"
              >
                <Pencil size={14} />
              </ActionIcon>
              {isManual && handleConvertToLinked && (
                <Tooltip label="Link with Plaid" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="blue"
                    onClick={handleConvertToLinked}
                    size="sm"
                    loading={initiateLinking.isPending}
                    aria-label="Link with Plaid"
                  >
                    <Link2 size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
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
                    aria-label="Reset to synced account name"
                  >
                    <RotateCcw size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
              <Tooltip label="Archive account" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => setArchiveModalOpened(true)}
                  size="sm"
                  aria-label="Archive account"
                >
                  <Archive size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
          <Text size="sm" c="dimmed" tt="capitalize">
            {formatAccountType(account.subType || account.type)}
          </Text>
          {account.syncedAt && (
            <Text size="xs" c="dimmed">
              Last synced {formatRelativeTime(new Date(account.syncedAt))}
            </Text>
          )}
        </div>
        <StatusBadge
          status={account.bankLink?.status}
          statusBody={account.bankLink?.statusBody}
          onFix={handleFixConnection}
        />
      </Group>
      <Modal
        opened={archiveModalOpened}
        onClose={() => setArchiveModalOpened(false)}
        title="Archive account"
        centered
      >
        <Stack>
          <Text>
            This will hide this account from the UI and set its current balance
            to zero. Historical transactions and balance snapshots will be
            preserved.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setArchiveModalOpened(false)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleArchive}
              loading={archiveAccount.isPending}
            >
              Confirm archive
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
