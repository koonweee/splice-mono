import { Alert, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import { IconPlus, IconRefresh, IconUpload } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import {
  getAccountControllerFindAllQueryKey,
  useAccountControllerFindAll,
  useBankLinkControllerSyncAllAccounts,
} from '../../api/clients/spliceAPI'
import type { Account } from '../../api/models'
import { InstitutionSection } from '@/components/accounts/InstitutionSection'
import { AddAccountModal } from '@/components/accounts/AddAccountModal'
import { BackfillModal } from '@/components/accounts/BackfillModal'
import { PageHeader } from '@/components/PageHeader'

export const Route = createFileRoute('/_authed/accounts')({
  validateSearch: (search: Record<string, unknown>) => ({
    accountId:
      typeof search.accountId === 'string' ? search.accountId : undefined,
  }),
  component: AccountsPage,
})

function AccountsPage() {
  const { accountId: highlightedAccountId } = Route.useSearch()
  const { data: accounts, isLoading, error } = useAccountControllerFindAll()
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false)
  const [backfillOpened, { open: openBackfill, close: closeBackfill }] =
    useDisclosure(false)
  const queryClient = useQueryClient()
  const syncAll = useBankLinkControllerSyncAllAccounts({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getAccountControllerFindAllQueryKey(),
        })
        showNotification({
          title: 'Sync complete',
          message: 'All accounts have been synced successfully',
          color: 'green',
        })
      },
      onError: () => {
        showNotification({
          title: 'Sync failed',
          message: 'Failed to sync accounts. Please try again.',
          color: 'red',
        })
      },
    },
  })

  // Group accounts by institution
  const groupedAccounts = useMemo(() => {
    if (!accounts) return new Map<string, Array<Account>>()

    const groups = new Map<string, Array<Account>>()
    accounts
      .filter(
        (account) =>
          !highlightedAccountId || account.id === highlightedAccountId,
      )
      .forEach((account) => {
        const institution =
          account.bankLink?.institutionName ?? 'Manual accounts'
        const existing = groups.get(institution) ?? []
        groups.set(institution, [...existing, account])
      })
    return groups
  }, [accounts, highlightedAccountId])

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    )
  }

  if (error) {
    return (
      <Alert color="red" title="Error">
        Failed to load accounts
      </Alert>
    )
  }

  return (
    <>
      <PageHeader
        title="Accounts"
        actions={
          <Group gap="sm">
            <Button
              leftSection={
                syncAll.isPending ? (
                  <Loader size={16} />
                ) : (
                  <IconRefresh size={16} />
                )
              }
              onClick={() => syncAll.mutate()}
              variant="outline"
              disabled={syncAll.isPending}
            >
              {syncAll.isPending ? 'Syncing...' : 'Sync all'}
            </Button>
            <Button
              leftSection={<IconUpload size={16} />}
              onClick={openBackfill}
              variant="outline"
            >
              Backfill
            </Button>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={openModal}
              variant="outline"
            >
              Add account
            </Button>
          </Group>
        }
      />
      <Stack gap="lg">
        {Array.from(groupedAccounts.entries()).map(
          ([institution, groupAccount]) => (
            <InstitutionSection
              key={institution}
              institution={institution}
              accounts={groupAccount}
            />
          ),
        )}
        {groupedAccounts.size === 0 && (
          <Text c="dimmed">No accounts found</Text>
        )}
      </Stack>
      <AddAccountModal opened={modalOpened} onClose={closeModal} />
      <BackfillModal opened={backfillOpened} onClose={closeBackfill} />
    </>
  )
}
