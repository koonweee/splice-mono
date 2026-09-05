import { ActionIcon, Group, Text, TextInput, Tooltip } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, Check, Link2, Pencil, RotateCcw, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useAccountMetadataMutation } from '../../hooks/useAccountMetadataMutation'
import { invalidateMutationFamilies } from '../../lib/query-invalidation'
import { SanitizedBankLinkStatus } from '../../api/models/sanitizedBankLinkStatus'
import { useBankLinkControllerInitiateLinking } from '../../api/clients/spliceAPI'
import { axios } from '../../api/axios'
import { getApiErrorMessage } from '../../lib/api-errors'
import { formatAccountType, formatRelativeTime } from '../../lib/format'
import {
  notifyMutationError,
  notifyMutationSuccess,
} from '../../lib/mutation-feedback'
import { ConfirmActionDialog } from '../ConfirmActionDialog'
import { StatusBadge } from './StatusBadge'
import type { Account } from '../../api/models'

function archiveAccountById(id: string): Promise<Account> {
  return axios<Account>({ url: `/account/${id}/archive`, method: 'POST' })
}

export function AccountRow({ account }: { account: Account }) {
  const initiateLinking = useBankLinkControllerInitiateLinking()
  const updateAccount = useAccountMetadataMutation(account.id)
  const archiveAccount = useMutation({
    mutationKey: ['accountControllerArchive'],
    mutationFn: ({ id }: { id: string }) => archiveAccountById(id),
  })
  const queryClient = useQueryClient()

  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [archiveModalOpened, setArchiveModalOpened] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const nameSubmissionPending = useRef(false)
  const archiveSubmissionPending = useRef(false)

  const displayName = account.customName ?? account.name ?? 'Unnamed account'
  const isLinked = !!account.bankLinkId
  const isManual = !isLinked
  const isHoldingsValued = account.valuationMode === 'holdings'

  const startEditing = useCallback(() => {
    if (nameSubmissionPending.current) return
    setEditedName(displayName)
    setNameError(null)
    setIsEditing(true)
  }, [displayName])

  const cancelEditing = useCallback(() => {
    if (nameSubmissionPending.current) return
    setIsEditing(false)
    setNameError(null)
  }, [])

  const invalidateAccounts = useCallback(() => {
    void invalidateMutationFamilies(queryClient, ['accounts'])
  }, [queryClient])

  const invalidateAccountBalances = useCallback(() => {
    void invalidateMutationFamilies(queryClient, ['balances'])
  }, [queryClient])

  const saveName = useCallback(() => {
    if (nameSubmissionPending.current || updateAccount.isPending) return
    if (!editedName.trim()) {
      setNameError('Account name is required')
      return
    }

    nameSubmissionPending.current = true
    setNameError(null)
    const data = isManual
      ? { name: editedName }
      : { customName: editedName === (account.name ?? '') ? null : editedName }
    updateAccount.mutate(
      { id: account.id, data },
      {
        onSuccess: () => {
          invalidateAccounts()
          setIsEditing(false)
        },
        onError: (error) => {
          setNameError(
            getApiErrorMessage(
              error,
              'Unable to save the account name. Try again.',
            ),
          )
        },
        onSettled: () => {
          nameSubmissionPending.current = false
        },
      },
    )
  }, [account, editedName, isManual, updateAccount, invalidateAccounts])

  const resetToSyncedName = useCallback(() => {
    if (nameSubmissionPending.current || updateAccount.isPending) return
    nameSubmissionPending.current = true
    updateAccount.mutate(
      { id: account.id, data: { customName: null } },
      {
        onSuccess: invalidateAccounts,
        onError: (error) => {
          notifyMutationError({
            title: 'Name not reset',
            error,
            fallback: 'Unable to restore the synced account name. Try again.',
          })
        },
        onSettled: () => {
          nameSubmissionPending.current = false
        },
      },
    )
  }, [account, updateAccount, invalidateAccounts])

  const handleArchive = useCallback(() => {
    if (archiveSubmissionPending.current || archiveAccount.isPending) return
    archiveSubmissionPending.current = true
    setArchiveError(null)
    archiveAccount.mutate(
      { id: account.id },
      {
        onSuccess: () => {
          invalidateAccounts()
          invalidateAccountBalances()
          notifyMutationSuccess({
            title: 'Account archived',
            message: 'The account has been hidden and its balance set to zero.',
          })
          setArchiveModalOpened(false)
        },
        onError: (error) => {
          setArchiveError(
            getApiErrorMessage(
              error,
              'Unable to archive this account. Try again.',
            ),
          )
        },
        onSettled: () => {
          archiveSubmissionPending.current = false
        },
      },
    )
  }, [
    account.id,
    archiveAccount,
    invalidateAccountBalances,
    invalidateAccounts,
  ])

  const needsFix =
    account.bankLink && account.bankLink.status !== SanitizedBankLinkStatus.OK

  const getPlaidRedirectUri = useCallback(
    () => window.location.href.replace(/^http:/, 'https:'),
    [],
  )

  const handleFixConnection = needsFix
    ? () => {
        if (initiateLinking.isPending) return
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
            onError: (error) => {
              notifyMutationError({
                title: 'Connection not started',
                error,
                fallback: 'Unable to reconnect this account. Try again.',
              })
            },
          },
        )
      }
    : undefined

  const handleConvertToLinked =
    isManual && !isHoldingsValued
      ? () => {
          if (initiateLinking.isPending) return
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
              onError: (error) => {
                notifyMutationError({
                  title: 'Link failed',
                  error,
                  fallback: 'Unable to start Plaid linking for this account.',
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
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                saveName()
              }}
            >
              <Group gap="xs" wrap="nowrap" align="flex-start">
                <TextInput
                  aria-label="Account name"
                  value={editedName}
                  error={nameError}
                  disabled={updateAccount.isPending}
                  onChange={(e) => {
                    setEditedName(e.currentTarget.value)
                    setNameError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cancelEditing()
                  }}
                  size="md"
                  autoFocus
                  style={{ flex: 1 }}
                />
                <ActionIcon
                  variant="subtle"
                  color="green"
                  type="submit"
                  loading={updateAccount.isPending}
                  size="lg"
                  aria-label="Save account name"
                >
                  <Check size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={cancelEditing}
                  disabled={updateAccount.isPending}
                  size="lg"
                  aria-label="Cancel account name edit"
                >
                  <X size={14} />
                </ActionIcon>
              </Group>
            </form>
          ) : (
            <Group gap={6} wrap="nowrap">
              <Text fw={500}>{displayName}</Text>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={startEditing}
                disabled={updateAccount.isPending}
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
                    loading={updateAccount.isPending}
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
                  onClick={() => {
                    setArchiveError(null)
                    setArchiveModalOpened(true)
                  }}
                  disabled={
                    updateAccount.isPending || initiateLinking.isPending
                  }
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
      <ConfirmActionDialog
        opened={archiveModalOpened}
        onClose={() => {
          if (!archiveSubmissionPending.current) setArchiveModalOpened(false)
        }}
        title="Archive account"
        targetLabel={displayName}
        consequence="This will hide this account from the UI and set its current balance to zero. Historical transactions and balance snapshots will be preserved."
        confirmLabel="Archive"
        onConfirm={handleArchive}
        isPending={archiveAccount.isPending}
        error={archiveError}
      />
    </>
  )
}
