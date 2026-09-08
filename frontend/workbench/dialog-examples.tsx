import { Button, Stack, Text } from '@mantine/core'
import { lazy, useEffect, useState } from 'react'
import { BACKFILL_TITLE } from '../src/components/accounts/BackfillInstructions'
import { DeferredOverlay } from '../src/components/DeferredOverlay'
import { AddAccountSkeleton } from '../src/components/accounts/AddAccountModal.skeleton'
import { BackfillSkeleton } from '../src/components/accounts/BackfillModal.skeleton'
import { AccountDetailsSkeleton } from '../src/components/AccountModal.skeleton'
import { ManualTransactionModalSkeleton } from '../src/components/transactions/ManualTransactionModal.skeleton'
import { ManualTransactionModal } from '../src/components/transactions/ManualTransactionModal'
import { AccountModal } from '../src/components/AccountModal'
import { AddAccountModal } from '../src/components/accounts/AddAccountModal'
import { BackfillModal } from '../src/components/accounts/BackfillModal'
import { PrivateSessionBoundary } from '../src/components/PrivateSessionBoundary'
import { PwaLifecycle } from '../src/components/PwaLifecycle'
import {
  clearPendingAppTransition,
  registerAppTransitionGuard,
  requestAppTransition,
} from '../src/lib/pwa/app-transition'
import { clearPrivateCaches } from '../src/lib/auth-generation'
import { TimePeriod } from '../src/lib/types'
import { waitForModule } from './loading-gates'
import { fixtureCategories, fixtureTransactions } from './page-fixtures'
import { fixtureAccounts, fixtureSummaries } from './fixtures'
import type { ExampleProps } from './examples'

const DeferredAddAccount = lazy(async () => {
  await waitForModule()
  return { default: AddAccountModal }
})
const DeferredBackfill = lazy(async () => {
  await waitForModule()
  return { default: BackfillModal }
})
const DeferredAccount = lazy(async () => {
  await waitForModule()
  return { default: AccountModal }
})
const DeferredManual = lazy(async () => {
  await waitForModule()
  return { default: ManualTransactionModal }
})

function AccountDialogs({ state, masked }: ExampleProps) {
  const [opened, setOpened] = useState(true)
  const onClose = () => setOpened(false)
  const account = {
    ...fixtureSummaries[0],
    ...(state === 'holdings'
      ? {
          valuationMode: 'holdings' as const,
          changePercent: undefined,
          changeAmount: undefined,
        }
      : {}),
  }
  return (
    <Stack>
      <Button onClick={() => setOpened(true)}>Open dialog</Button>
      {opened &&
        (state === 'add' ? (
          <DeferredOverlay
            label="Add account"
            onClose={onClose}
            minHeight={0}
            skeleton={<AddAccountSkeleton />}
          >
            <DeferredAddAccount opened={opened} onClose={onClose} />
          </DeferredOverlay>
        ) : state === 'backfill' ? (
          <DeferredOverlay
            label="Backfill"
            title={BACKFILL_TITLE}
            size="lg"
            onClose={onClose}
            minHeight={0}
            skeleton={<BackfillSkeleton />}
          >
            <DeferredBackfill opened={opened} onClose={onClose} />
          </DeferredOverlay>
        ) : (
          <DeferredOverlay
            label={account.name}
            onClose={onClose}
            size="xl"
            centered={false}
            minHeight={0}
            skeleton={
              <AccountDetailsSkeleton
                account={account}
                period={TimePeriod.month}
              />
            }
          >
            <DeferredAccount
              account={account}
              opened={opened}
              onClose={onClose}
              balancesHidden={masked}
              period={TimePeriod.month}
            />
          </DeferredOverlay>
        ))}
    </Stack>
  )
}
function ManualSave() {
  const [opened, setOpened] = useState(true)
  return (
    <Stack>
      <Button onClick={() => setOpened(true)}>Open editor</Button>
      {opened && (
        <DeferredOverlay
          label="Edit transaction"
          onClose={() => setOpened(false)}
          skeleton={<ManualTransactionModalSkeleton editing />}
        >
          <DeferredManual
            opened={opened}
            onClose={() => setOpened(false)}
            accounts={fixtureAccounts}
            defaultAccountId="cash"
            categories={fixtureCategories}
            transaction={fixtureTransactions.find(
              (item) => item.source === 'manual',
            )}
          />
        </DeferredOverlay>
      )}
    </Stack>
  )
}
function Lifecycle({ state }: ExampleProps) {
  useEffect(() => {
    if (state === 'offline') window.dispatchEvent(new Event('offline'))
    if (state === 'blocked-update') return registerAppTransitionGuard()
    if (state === 'deferred') {
      const release = registerAppTransitionGuard()
      requestAppTransition(() => {})
      release()
      return clearPendingAppTransition
    }
  }, [state])
  return (
    <Stack>
      <Text>
        Lifecycle notifications use the real banner with local service-worker
        and badge adapters.
      </Text>
      <PwaLifecycle />
    </Stack>
  )
}
function SessionBoundary({ state }: ExampleProps) {
  useEffect(() => {
    if (state === 'blocked') clearPrivateCaches(false)
  }, [state])
  return (
    <PrivateSessionBoundary>
      <Text>
        Authenticated content remains available while the identity is stable.
      </Text>
    </PrivateSessionBoundary>
  )
}
export const dialogExamples = [
  {
    id: 'manual-save',
    title: 'Manual transaction save recovery',
    component: ManualSave,
    states: ['ready', 'offline', 'lost-response', 'reconcile-error'],
    components: [
      'ManualTransactionModal',
      'ManualTransactionFormFrame',
      'ManualTransactionModalSkeleton',
    ],
  },
  {
    id: 'account-dialogs',
    title: 'Account details, add, backfill and holdings dialogs',
    component: AccountDialogs,
    states: ['account', 'add', 'backfill', 'holdings'],
    components: [
      'AccountModal',
      'AddAccountModal',
      'BackfillModal',
      'ManualBrokerageHoldingsModal',
      'AccountComparisonFrame',
      'AccountDetailsSkeleton',
      'AccountSections',
      'AccountProviderCard',
      'AddAccountSkeleton',
      'BackfillSkeleton',
      'InvestmentActivityTableSkeleton',
      'InvestmentActivityTable',
      'InvestmentHoldingsTableSkeleton',
      'InvestmentHoldingsTable',
      'InvestmentTableFrame',
      'ManualBrokerageHoldingsModalSkeleton',
      'BackfillInstructions',
    ],
  },
  {
    id: 'pwa-lifecycle',
    title: 'Offline and update banners',
    component: Lifecycle,
    states: [
      'offline',
      'update',
      'update-error',
      'blocked-update',
      'error',
      'deferred',
      'logout-pending',
      'ready',
    ],
    components: ['PwaLifecycle'],
  },
  {
    id: 'session-boundary',
    title: 'Private session boundary',
    component: SessionBoundary,
    states: ['ready', 'blocked'],
    components: ['PrivateSessionBoundary'],
  },
]
