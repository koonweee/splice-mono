import { Stack } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { showNotification } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { lazy, useMemo } from 'react'
import { BACKFILL_TITLE } from '../../components/accounts/BackfillInstructions'
import { AddAccountSkeleton } from '../../components/accounts/AddAccountModal.skeleton'
import { BackfillSkeleton } from '../../components/accounts/BackfillModal.skeleton'
import {
  loadAddAccountModal,
  loadBackfillModal,
} from '../../lib/feature-loaders'
import { AccountsSkeleton } from '../../components/accounts/InstitutionSection.skeleton'
import { DeferredOverlay } from '../../components/DeferredOverlay'
import {
  useAccountControllerFindAll,
  useBankLinkControllerSyncAllAccounts,
} from '../../api/clients/spliceAPI'
import { accountsQueryOptions } from '../../lib/queries/primary'
import { loadQuery } from '../../lib/queries/loader'
import { invalidateMutationFamilies } from '../../lib/query-invalidation'
import { AccountsPageFrame } from '../../components/pages/AccountsPageFrame'
import type { Account } from '../../api/models'
import { InstitutionSection } from '@/components/accounts/InstitutionSection'
import { DataState } from '@/components/DataState'

const AddAccountModal = lazy(loadAddAccountModal)
const BackfillModal = lazy(loadBackfillModal)

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
      <AccountsPageFrame
        onAdd={openModal}
        onSync={() => syncAll.mutate()}
        onBackfill={openBackfill}
        syncing={syncAll.isPending}
      >
        <DataState
          backgroundErrorMode="header"
          hasData={groupedAccounts.size > 0}
          isLoading={isLoading}
          isError={Boolean(error)}
          isFetching={isFetching}
          loadingMessage="Loading accounts…"
          loadingFallback={<AccountsSkeleton />}
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
      </AccountsPageFrame>
      {modalOpened && (
        <DeferredOverlay
          label="Add account"
          onClose={closeModal}
          minHeight={0}
          skeleton={<AddAccountSkeleton />}
        >
          <AddAccountModal opened={modalOpened} onClose={closeModal} />
        </DeferredOverlay>
      )}
      {backfillOpened && (
        <DeferredOverlay
          label="Backfill balances"
          title={BACKFILL_TITLE}
          minHeight={0}
          skeleton={<BackfillSkeleton />}
          size="lg"
          onClose={closeBackfill}
        >
          <BackfillModal opened={backfillOpened} onClose={closeBackfill} />
        </DeferredOverlay>
      )}
    </>
  )
}
