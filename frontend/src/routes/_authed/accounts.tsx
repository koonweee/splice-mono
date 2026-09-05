import { Button, Group, Loader, Stack } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import { IconPlus, IconRefresh, IconUpload } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { lazy, useMemo } from 'react'
import { DeferredFeature } from '../../components/DeferredFeature'
import {
  useAccountControllerFindAll,
  useBankLinkControllerSyncAllAccounts,
} from '../../api/clients/spliceAPI'
import { accountsQueryOptions } from '../../lib/queries/primary'
import { loadQuery } from '../../lib/queries/loader'
import { invalidateMutationFamilies } from '../../lib/query-invalidation'
import type { Account } from '../../api/models'
import { InstitutionSection } from '@/components/accounts/InstitutionSection'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/DataState'

const AddAccountModal = lazy(() =>
  import('@/components/accounts/AddAccountModal').then((module) => ({
    default: module.AddAccountModal,
  })),
)
const BackfillModal = lazy(() =>
  import('@/components/accounts/BackfillModal').then((module) => ({
    default: module.BackfillModal,
  })),
)

export const Route = createFileRoute('/_authed/accounts')({
  validateSearch: (search: Record<string, unknown>) => ({
    accountId:
      typeof search.accountId === 'string' ? search.accountId : undefined,
  }),
  loader: async ({ context }) => {
    await loadQuery(context.queryClient, accountsQueryOptions())
  },
  component: AccountsPage,
})

function AccountsPage() {
  const { accountId: highlightedAccountId } = Route.useSearch()
  const {
    data: accounts,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useAccountControllerFindAll()
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false)
  const [backfillOpened, { open: openBackfill, close: closeBackfill }] =
    useDisclosure(false)
  const queryClient = useQueryClient()
  const syncAll = useBankLinkControllerSyncAllAccounts({
    mutation: {
      onSuccess: () => {
        void invalidateMutationFamilies(queryClient, [
          'accounts',
          'balances',
          'investments',
          'transactions',
          'analysis',
          'categories',
        ])
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
      <DataState
        hasData={groupedAccounts.size > 0}
        isLoading={isLoading}
        isError={Boolean(error)}
        isFetching={isFetching}
        loadingMessage="Loading accounts…"
        errorMessage="Failed to load accounts"
        emptyMessage="No accounts found"
        onRetry={() => void refetch()}
      >
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
        </Stack>
      </DataState>
      {modalOpened && (
        <DeferredFeature label="Add account">
          <AddAccountModal opened={modalOpened} onClose={closeModal} />
        </DeferredFeature>
      )}
      {backfillOpened && (
        <DeferredFeature label="Backfill balances">
          <BackfillModal opened={backfillOpened} onClose={closeBackfill} />
        </DeferredFeature>
      )}
    </>
  )
}
