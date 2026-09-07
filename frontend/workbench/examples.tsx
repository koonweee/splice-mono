import {
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  MantineProvider,
  Paper,
  Radio,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import { useState } from 'react'
import dayjs from 'dayjs'
import { notifications } from '@mantine/notifications'
import { DataState } from '../src/components/DataState'
import { moneyToChartNumber } from '../src/lib/money'
import { formatMoneyNumber, formatMoneyWithSign } from '../src/lib/format'
import { designVariables } from '../src/lib/design-system/variables'
import { resolveAppearance } from '../src/lib/design-system/appearance'
import { AppearanceControl } from '../src/components/settings/AppearanceControl'
import { PageHeader } from '../src/components/PageHeader'
import { LifecycleBadge } from '../src/components/LifecycleBadge'
import { InteractiveRow } from '../src/components/InteractiveRow'
import { MobileTableList } from '../src/components/MobileTableList'
import { DecimalInput } from '../src/components/forms/DecimalInput'
import { EditorModal } from '../src/components/forms/EditorModal'
import { FormActions } from '../src/components/forms/FormActions'
import { ConfirmActionDialog } from '../src/components/ConfirmActionDialog'
import { DateRangeControl } from '../src/components/DateRangeControl'
import { Chart } from '../src/components/Chart'
import { HomePeriodControl } from '../src/components/HomePeriodControl'
import { TimePeriod } from '../src/lib/types'
import { fixtureDashboard } from './page-fixtures'
import { investmentExamples } from './investment-examples'
import { categoryExamples } from './category-examples'
import { appearanceFromSearch } from './preferences'
import { dialogExamples } from './dialog-examples'
import { pageExamples } from './page-examples'
import { accountExamples } from './account-examples'
import { loadingExamples } from './loading-examples'
import type { DatesRangeValue } from '@mantine/dates'
import type { ChartDataPoint } from '../src/components/Chart'

export type ExampleProps = { state: string; masked: boolean }

function Controls({ state }: ExampleProps) {
  const [value, setValue] = useState('125.00')
  return (
    <Stack>
      <PageHeader title="Controls" />
      <TextInput
        label="Account name"
        defaultValue="Everyday account"
        disabled={state === 'pending'}
        error={state === 'error' ? 'Enter a unique name' : undefined}
      />
      <DecimalInput label="Balance" value={value} onChange={setValue} />
      <Select
        label="Currency"
        data={['USD', 'SGD', 'EUR']}
        defaultValue="USD"
        searchable
      />
      <Group>
        <Checkbox label="Include archived" disabled={state === 'pending'} />
        <Checkbox
          label="Selected checkbox"
          defaultChecked
          disabled={state === 'pending'}
        />
        <Checkbox
          label="Partial selection"
          indeterminate
          disabled={state === 'pending'}
        />
      </Group>
      <Radio.Group label="Amount display" defaultValue="exact">
        <Group mt="xs">
          <Radio value="exact" label="Exact" disabled={state === 'pending'} />
          <Radio
            value="rounded"
            label="Rounded"
            disabled={state === 'pending'}
          />
        </Group>
      </Radio.Group>
      <Group>
        <Switch
          label="Show balances"
          defaultChecked
          disabled={state === 'pending'}
        />
        <Switch label="Show archived" disabled={state === 'pending'} />
      </Group>
      <Group>
        <Button loading={state === 'pending'}>Save changes</Button>
        <Button variant="default">Cancel</Button>
      </Group>
      <Group>
        {(['Active', 'Paused', 'Archived', 'Ended'] as const).map((status) => (
          <LifecycleBadge key={status} status={status} />
        ))}
      </Group>
      <Button
        variant="light"
        onClick={() =>
          notifications.show({
            title: 'Saved locally',
            message: 'This notification belongs to this example only.',
          })
        }
      >
        Show notification
      </Button>
    </Stack>
  )
}

function Rows({ state, masked }: ExampleProps) {
  const [selected, setSelected] = useState(false)
  const [action, setAction] = useState('No action yet')
  const data =
    state === 'empty' || state === 'loading' || state === 'error'
      ? []
      : [
          { id: 'cash', name: 'Everyday account', balance: '$1,240.50' },
          {
            id: 'long',
            name: 'A deliberately long investment account name for responsive wrapping',
            balance: '$123,456,789.00',
          },
          { id: 'debt', name: 'Credit card', balance: '−$234.12' },
          { id: 'zero', name: 'Closed account', balance: '$0.00' },
        ]
  return (
    <Stack>
      <PageHeader title="Account rows" />
      <Text role="status">{action}</Text>
      <MobileTableList
        ariaLabel="Fixture accounts"
        data={data}
        getRowKey={(row) => row.id}
        emptyMessage="No accounts yet."
        isLoading={state === 'loading'}
        isError={state === 'error' || state === 'refresh-error'}
        isFetching={state === 'pending'}
        onRetry={() => setAction('Retry requested')}
        isRowSelected={(row) => row.id === 'cash' && selected}
        renderRow={(row) => (
          <InteractiveRow
            actionLabel={`Open ${row.name}`}
            onActivate={() => setAction(`Opened ${row.name}`)}
          >
            <Group p="md" wrap="nowrap">
              <Checkbox
                aria-label={`Select ${row.name}`}
                checked={row.id === 'cash' && selected}
                onChange={() => setSelected(!selected)}
              />
              <Text flex={1}>{row.name}</Text>
              <Text>{masked ? '••••' : row.balance}</Text>
              <Button
                variant="subtle"
                onClick={() => setAction(`Edited ${row.name}`)}
              >
                Edit
              </Button>
            </Group>
          </InteractiveRow>
        )}
      />
    </Stack>
  )
}

function Editors({ state }: ExampleProps) {
  const confirmationState = state.startsWith('confirm-')
  const pending = state === 'pending' || state === 'validation-pending'
  const [opened, setOpened] = useState(confirmationState)
  const [confirm, setConfirm] = useState(confirmationState)
  const [range, setRange] = useState<DatesRangeValue>([
    '2026-08-01',
    '2026-08-31',
  ])
  const [amount, setAmount] = useState('125.00')
  const closeEditor = () => {
    if (!pending && !confirm) setOpened(false)
  }
  return (
    <Stack>
      <PageHeader title="Editors and portals" />
      <Button onClick={() => setOpened(true)}>Open editor</Button>
      <EditorModal
        opened={opened}
        onClose={closeEditor}
        closeOnEscape={!pending && !confirm}
        closeOnClickOutside={!pending && !confirm}
        closeButtonProps={{ disabled: pending }}
        trapFocus={!confirm}
        title="Edit fixture account"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!pending && state !== 'error') closeEditor()
          }}
        >
          <Stack>
            <Box component="fieldset" disabled={pending} m={0} p={0} bd={0}>
              <Stack>
                <TextInput
                  label="Name"
                  defaultValue="Everyday account"
                  error={
                    state === 'error' || state === 'validation-pending'
                      ? 'This account name already exists.'
                      : undefined
                  }
                />
                <DecimalInput
                  label="Balance"
                  value={amount}
                  onChange={setAmount}
                />
                <DateRangeControl value={range} onChange={setRange} />
                <Button
                  type="button"
                  color="red"
                  variant="light"
                  onClick={() => setConfirm(true)}
                >
                  Archive account
                </Button>
              </Stack>
            </Box>
            <FormActions onCancel={closeEditor} cancelDisabled={pending}>
              <Button type="submit" loading={pending}>
                Save
              </Button>
            </FormActions>
          </Stack>
        </form>
      </EditorModal>
      <ConfirmActionDialog
        opened={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => setConfirm(false)}
        title="Archive account"
        targetLabel="Everyday account"
        consequence="This is a local demonstration. No account will be changed."
        confirmLabel="Archive"
        isPending={state === 'confirm-pending'}
        error={
          state === 'confirm-error' ? 'Fixture failure. Try again.' : undefined
        }
      />
    </Stack>
  )
}

function History({ state, masked }: ExampleProps) {
  const [period, setPeriod] = useState(TimePeriod.month)
  const [hover, setHover] = useState<ChartDataPoint>()
  const [loaded, setLoaded] = useState(false)
  const [retried, setRetried] = useState(false)
  const loading = state === 'loading' && !loaded
  const series = fixtureDashboard(period, state === 'empty').series
  const points = state === 'single' ? series.points.slice(-1) : series.points
  const data: Array<ChartDataPoint> = points.map((point) => ({
    date: point.date,
    label: dayjs(point.date).format(
      [TimePeriod.day, TimePeriod.week, TimePeriod.month].includes(period)
        ? 'MMM D'
        : 'MMM D, YYYY',
    ),
    value: moneyToChartNumber(point.netWorth),
    money: point.netWorth,
  }))
  const current = hover ?? data.at(-1)
  return (
    <Stack gap="md">
      <PageHeader title="Net worth history" />
      <Text size="xl" fw={600}>
        {loading
          ? 'Loading…'
          : masked
            ? '••••'
            : current
              ? formatMoneyWithSign({ value: current.money })
              : 'No balance'}
      </Text>
      {state === 'empty' && <Alert>No history for this period.</Alert>}
      <DataState
        hasData
        isError={state === 'refresh-error' && !retried}
        errorMessage="Unable to refresh history."
        onRetry={() => setRetried(true)}
      >
        <Chart
          data={data}
          minimal
          animate
          placeholder
          loading={loading}
          valueFormatter={(value) =>
            masked ? '••••' : formatMoneyNumber({ value, currency: 'USD' })
          }
          pointFormatter={(point) =>
            masked ? '••••' : formatMoneyWithSign({ value: point.money })
          }
          onDataPointHover={setHover}
        />
      </DataState>
      <HomePeriodControl
        period={period}
        onChange={(next) => {
          setHover(undefined)
          setPeriod(next)
        }}
      />
      {state === 'loading' && (
        <Button
          variant="default"
          onClick={() => {
            setHover(undefined)
            setLoaded(!loaded)
          }}
        >
          {loaded ? 'Replay loading' : 'Finish loading'}
        </Button>
      )}
      <Paper withBorder p="md">
        <Text size="sm" c="dimmed">
          Switch ranges to inspect morphing; hover to inspect values. Loading
          points are decorative.
        </Text>
      </Paper>
    </Stack>
  )
}

function AppearanceExample() {
  const [value, setValue] = useState(
    () => appearanceFromSearch(location.search).preference,
  )
  const resolved = resolveAppearance(value)
  return (
    <MantineProvider
      theme={resolved.theme}
      forceColorScheme={resolved.colorScheme}
      cssVariablesResolver={designVariables}
    >
      <PageHeader title="Appearance settings" />
      <AppearanceControl value={value} onChange={setValue} />
    </MantineProvider>
  )
}

export const examples = [
  {
    id: 'appearance',
    title: 'Appearance settings',
    component: AppearanceExample,
    states: ['ready'],
    components: ['AppearanceControl'],
  },
  ...loadingExamples,
  ...accountExamples,
  ...pageExamples,
  ...dialogExamples,
  ...investmentExamples,
  ...categoryExamples,
  {
    id: 'controls',
    title: 'Controls and status',
    component: Controls,
    states: ['ready', 'pending', 'error'],
    components: ['PageHeader', 'DecimalInput', 'LifecycleBadge'],
  },
  {
    id: 'rows',
    title: 'Rows and retained data',
    component: Rows,
    states: ['ready', 'loading', 'empty', 'error', 'pending', 'refresh-error'],
    components: ['InteractiveRow', 'MobileTableList', 'DataState'],
  },
  {
    id: 'editors',
    title: 'Editor, picker and confirmation',
    component: Editors,
    states: [
      'ready',
      'pending',
      'error',
      'confirm-ready',
      'validation-pending',
      'confirm-pending',
      'confirm-error',
    ],
    components: [
      'EditorModal',
      'FormActions',
      'DateRangeControl',
      'DateRangeFields',
      'ConfirmActionDialog',
    ],
  },
  {
    id: 'history',
    title: 'Chart and period control',
    component: History,
    states: ['ready', 'loading', 'empty', 'single', 'refresh-error'],
    components: ['Chart', 'HomePeriodControl'],
  },
]
