import { Button, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { AccountModal } from '../src/components/AccountModal'
import { AddAccountModal } from '../src/components/accounts/AddAccountModal'
import { BackfillModal } from '../src/components/accounts/BackfillModal'
import { PrivateSessionBoundary } from '../src/components/PrivateSessionBoundary'
import { PwaLifecycle } from '../src/components/PwaLifecycle'
import { clearPrivateCaches } from '../src/lib/auth-generation'
import { TimePeriod } from '../src/lib/types'
import { fixtureSummaries } from './fixtures'
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
function Lifecycle({ state }: ExampleProps) {
  useEffect(() => {
    if (state === 'offline') window.dispatchEvent(new Event('offline'))
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
    states: ['offline', 'update', 'ready'],
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
