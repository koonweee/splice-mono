import { Button, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
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
import { fixtureCategories, fixtureTransactions } from './page-fixtures'
import { fixtureAccounts, fixtureSummaries } from './fixtures'
import type { ExampleProps } from './examples'

function AccountDialogs({ state, masked }: ExampleProps) {
  const [opened, setOpened] = useState(true)
  const onClose = () => setOpened(false)
  return (
    <Stack>
      <Button onClick={() => setOpened(true)}>Open dialog</Button>
      {state === 'add' ? (
        <AddAccountModal opened={opened} onClose={onClose} />
      ) : state === 'backfill' ? (
        <BackfillModal opened={opened} onClose={onClose} />
      ) : (
        <AccountModal
          account={{
            ...fixtureSummaries[0],
            ...(state === 'holdings'
              ? {
                  valuationMode: 'holdings' as const,
                  changePercent: undefined,
                  changeAmount: undefined,
                }
              : {}),
          }}
          opened={opened}
          onClose={onClose}
          balancesHidden={masked}
          period={TimePeriod.month}
        />
      )}
    </Stack>
  )
}
function ManualSave() {
  const [opened, setOpened] = useState(true)
  return (
    <Stack>
      <Button onClick={() => setOpened(true)}>Open editor</Button>
      <ManualTransactionModal
        opened={opened}
        onClose={() => setOpened(false)}
        accounts={fixtureAccounts}
        defaultAccountId="cash"
        categories={fixtureCategories}
        transaction={fixtureTransactions.find(
          (item) => item.source === 'manual',
        )}
      />
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
    components: ['ManualTransactionModal'],
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
