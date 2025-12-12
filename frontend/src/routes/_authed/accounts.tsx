import { AddAccountModal } from '@/components/accounts/AddAccountModal'
import { InstitutionSection } from '@/components/accounts/InstitutionSection'
import { Alert, Button, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import { IconPlus, IconRefresh } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import {
  getAccountControllerFindAllQueryKey,
  useAccountControllerFindAll,
  useBankLinkControllerSyncAllAccounts,
} from '../../api/clients/spliceAPI'
import type { Account } from '../../api/models'

export const Route = createFileRoute('/_authed/accounts')({
  component: AccountsPage,
})

function AccountsPage() {
  const { data: accounts, isLoading, error } = useAccountControllerFindAll()
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false)
  const queryClient = useQueryClient()
  const syncAll = useBankLinkControllerSyncAllAccounts({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getAccountControllerFindAllQueryKey(),
        })
        showNotification({
          title: 'Sync Complete',
          message: 'All accounts have been synced successfully',
          color: 'green',
        })
      },
      onError: () => {
        showNotification({
          title: 'Sync Failed',
          message: 'Failed to sync accounts. Please try again.',
          color: 'red',
        })
      },
    },
  })

  // Group accounts by institution
  const groupedAccounts = useMemo(() => {
    if (!accounts) return new Map<string, Account[]>()

    const groups = new Map<string, Account[]>()
    for (const account of accounts) {
      const institution = account.bankLink?.institutionName ?? 'Manual Accounts'
      const existing = groups.get(institution) ?? []
      groups.set(institution, [...existing, account])
    }
    return groups
  }, [accounts])

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
      <Group justify="space-between" mb="xl">
        <Title order={1}>Accounts</Title>
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
            {syncAll.isPending ? 'Syncing...' : 'Sync All'}
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openModal}
            variant="outline"
          >
            Add Account
          </Button>
        </Group>
      </Group>
      <Stack gap="lg">
        {Array.from(groupedAccounts.entries()).map(
          ([institution, accounts]) => (
            <InstitutionSection
              key={institution}
              institution={institution}
              accounts={accounts}
            />
          ),
        )}
        {groupedAccounts.size === 0 && (
          <Text c="dimmed">No accounts found</Text>
        )}
      </Stack>
      <AddAccountModal opened={modalOpened} onClose={closeModal} />
    </>
  )
}
