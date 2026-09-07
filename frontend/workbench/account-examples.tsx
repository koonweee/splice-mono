import { Alert, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useAccountControllerFindAll } from '../src/api/clients/spliceAPI'
import { AccountSection } from '../src/components/AccountSection'
import { AccountCard } from '../src/components/AccountCard'
import { InstitutionSection } from '../src/components/accounts/InstitutionSection'
import { InlineBalanceEditor } from '../src/components/accounts/InlineBalanceEditor'
import { AccountSelect } from '../src/components/accounts/AccountSelect'
import { ProviderBadge } from '../src/components/accounts/ProviderBadge'
import { StatusBadge } from '../src/components/accounts/StatusBadge'
import { SettingsToolbar } from '../src/components/settings/SettingsToolbar'
import { SettingsArchiveFilter } from '../src/components/settings/SettingsArchiveFilter'
import { SettingsStatusBadge } from '../src/components/settings/SettingsStatusBadge'
import { DataState } from '../src/components/DataState'
import { fixtureAccounts, fixtureSummaries } from './fixtures'
import type { ExampleProps } from './examples'

function AccountOverview({ state, masked }: ExampleProps) {
  const [selected, setSelected] = useState('No account selected')
  return (
    <Stack>
      <Text role="status">{selected}</Text>
      <Text data-typography="metadata" c="dimmed">
        Hover or tap a group percentage to reveal its total; change percentages
        reveal the change amount. Mask balances to check both disclosures.
      </Text>
      <AccountSection
        title="Assets"
        accounts={
          state === 'empty'
            ? []
            : fixtureSummaries.filter((a) => a.type !== 'credit')
        }
        balancesHidden={masked}
        comparisonLoading={state === 'loading'}
        isLiability={false}
        onAccountClick={(account) => setSelected(account.name)}
      />
      <AccountSection
        title="Liabilities"
        accounts={
          state === 'empty'
            ? []
            : fixtureSummaries.filter((a) => a.type === 'credit')
        }
        balancesHidden={masked}
        comparisonLoading={state === 'loading'}
        isLiability
        onAccountClick={(account) => setSelected(account.name)}
      />
      <Text size="sm" c="dimmed">
        Standalone account card (its production API has no masking option):
      </Text>
      <AccountCard account={fixtureSummaries[0]} isLiability={false} />
    </Stack>
  )
}
function AccountManagement({ state }: ExampleProps) {
  const { data, isLoading, error, refetch, isFetching } =
    useAccountControllerFindAll()
  const [selected, setSelected] = useState<string | null>('cash')
  const [editing, setEditing] = useState(true)
  const account = data?.find((a) => a.id === selected) ?? fixtureAccounts[1]
  return (
    <Stack>
      <DataState
        isLoading={isLoading}
        isError={Boolean(error)}
        isFetching={isFetching}
        hasData={Boolean(data?.length)}
        onRetry={() => void refetch()}
      />
      <AccountSelect
        label="Account"
        data={(data ?? fixtureAccounts).map((a) => ({
          value: a.id,
          label: a.name ?? 'Unnamed account',
        }))}
        value={selected}
        onChange={setSelected}
        disabled={state === 'disabled'}
      />
      {editing ? (
        <Paper p="md" withBorder>
          <InlineBalanceEditor
            account={account}
            balance={account.currentBalance}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        </Paper>
      ) : (
        <Button onClick={() => setEditing(true)}>Edit balance</Button>
      )}
      {data && (
        <InstitutionSection institution="Example institution" accounts={data} />
      )}
    </Stack>
  )
}
function StatusExamples() {
  const [archived, setArchived] = useState(false)
  const [message, setMessage] = useState('No action yet')
  return (
    <Stack>
      <SettingsToolbar
        title="Rules"
        description="Status and provider colors keep their meaning across accents."
        addLabel="Add rule"
        onAdd={() => setMessage('Add rule selected')}
      >
        <SettingsArchiveFilter checked={archived} onChange={setArchived} />
      </SettingsToolbar>
      <Group>
        {(['Active', 'Paused', 'Archived', 'Ended'] as const).map((status) => (
          <SettingsStatusBadge key={status} status={status} />
        ))}
      </Group>
      <Group>
        {['plaid', 'simplefin', 'crypto', 'unknown'].map((provider) => (
          <ProviderBadge key={provider} provider={provider} />
        ))}
      </Group>
      <Group>
        <StatusBadge />
        <StatusBadge status="OK" />
        <StatusBadge
          status="ERROR"
          statusBody={{
            display_message: 'Connection unavailable',
            suggested_action: 'Try again later',
          }}
          onFix={() => setMessage('Fixture fix selected')}
        />
        <StatusBadge
          status="PENDING_REAUTH"
          statusBody={{ reason: 'Consent expired' }}
          onFix={() => setMessage('Fixture reauthentication selected')}
        />
      </Group>
      <Group>
        <Badge variant="light" color="gray" size="sm">
          Setting
        </Badge>
        <Badge variant="light" color="violet" size="sm">
          Rule
        </Badge>
        <Badge variant="light" color="blue" size="sm">
          Information
        </Badge>
        <Badge variant="light" color="yellow" size="sm">
          Warning
        </Badge>
      </Group>
      <Alert color="red" title="Changes not saved">
        Your draft remains available. Try saving again.
      </Alert>
      <Alert color="yellow" title="Using cached prices">
        Current quotes are unavailable. The last known values are shown.
      </Alert>
      <Alert color="green" title="Changes saved">
        Your preferences have been updated.
      </Alert>
      <Alert color="blue" title="Update available">
        Reload when you are ready to use the latest version.
      </Alert>
      <Alert color="gray" title="No recent activity">
        There are no new records for this period.
      </Alert>
      <Text role="status">{message}</Text>
    </Stack>
  )
}
export const accountExamples = [
  {
    id: 'account-overview',
    title: 'Account summary groups',
    component: AccountOverview,
    states: ['ready', 'loading', 'empty'],
    components: [
      'AccountSection',
      'CompactAccountRow',
      'AccountCard',
      'ChangePercentPopover',
      'PercentAmountPopover',
      'Pressable',
    ],
  },
  {
    id: 'account-management',
    title: 'Account edits and archive',
    component: AccountManagement,
    states: ['ready', 'disabled'],
    components: [
      'InstitutionSection',
      'AccountRow',
      'AccountSelect',
      'InlineBalanceEditor',
    ],
  },
  {
    id: 'status-colors',
    title: 'Status, providers and settings toolbar',
    component: StatusExamples,
    states: ['ready'],
    components: [
      'ProviderBadge',
      'StatusBadge',
      'SettingsToolbar',
      'SettingsArchiveFilter',
      'SettingsStatusBadge',
    ],
  },
]
