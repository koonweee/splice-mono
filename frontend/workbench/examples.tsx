import {
  ActionIcon,
  Alert,
  Autocomplete,
  Box,
  Burger,
  Button,
  Checkbox,
  CloseButton,
  ColorInput,
  FileInput,
  Group,
  MantineProvider,
  Menu,
  MultiSelect,
  NavLink,
  NumberInput,
  Paper,
  Radio,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import { useState } from 'react'
import { Download, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'
import { notifications } from '@mantine/notifications'
import { PageActions } from '../src/components/PageActions'
import { AccountSelect } from '../src/components/accounts/AccountSelect'
import { CategorySelect } from '../src/components/categories/CategorySelect'
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
import { typographyExamples } from './typography-examples'
import { appearanceFromSearch } from './preferences'
import { notificationExamples } from './notification-examples'
import { dialogExamples } from './dialog-examples'
import { pageExamples } from './page-examples'
import { accountExamples } from './account-examples'
import { loadingExamples } from './loading-examples'
import type { DatesRangeValue } from '@mantine/dates'
import type { ChartDataPoint } from '../src/components/Chart'

export type ExampleProps = { state: string; masked: boolean }

function TouchControls({ state }: ExampleProps) {
  const [outlines, setOutlines] = useState(false)
  const [count, setCount] = useState(0)
  const [account, setAccount] = useState<string | null>('cash')
  const [category, setCategory] = useState<string | null>('food')
  const [period, setPeriod] = useState(TimePeriod.month)
  const disabled = state === 'disabled'
  return (
    <Stack className="touch-audit" data-outlines={outlines} gap="sm">
      <Text fw={600}>Compact touch controls</Text>
      <Text size="sm" c="dimmed">
        44px targets with compact artwork. Try the padding around a checkbox,
        clear an input, or open a menu. Wide touch devices use the same target
        sizes.
      </Text>
      <Switch
        label="Show target boundaries"
        checked={outlines}
        onChange={(event) => setOutlines(event.currentTarget.checked)}
      />
      <Group justify="space-between">
        <Text size="sm" aria-live="polite">
          Actions: {count}
        </Text>
        <PageActions
          primary={{
            id: 'add',
            label: 'Add item',
            icon: Plus,
            onClick: () => setCount(count + 1),
            disabled,
          }}
          secondary={[
            {
              id: 'edit',
              label: 'Edit item',
              icon: Pencil,
              onClick: () => setCount(count + 1),
              disabled,
            },
            {
              id: 'export',
              label: 'Export items',
              icon: Download,
              onClick: () => setCount(count + 1),
              disabled,
            },
            {
              id: 'remove',
              label: 'Delete item',
              icon: Trash2,
              onClick: () => setCount(count + 1),
              disabled,
            },
          ]}
        />
      </Group>
      <Group gap={4}>
        <Button
          size="xs"
          disabled={disabled}
          onClick={() => setCount(count + 1)}
        >
          Small button
        </Button>
        <ActionIcon
          size="xs"
          aria-label="Small edit button"
          disabled={disabled}
          onClick={() => setCount(count + 1)}
        >
          <Pencil size={14} />
        </ActionIcon>
        <Menu withinPortal>
          <Menu.Target>
            <ActionIcon aria-label="Sample menu" disabled={disabled}>
              <MoreHorizontal size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Pencil size={16} />}
              onClick={() => setCount(count + 1)}
            >
              Edit
            </Menu.Item>
            <Menu.Item
              leftSection={<Download size={16} />}
              onClick={() => setCount(count + 1)}
            >
              Export
            </Menu.Item>
            <Menu.Item disabled>Unavailable action</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <HomePeriodControl period={period} onChange={setPeriod} />
      <Stack gap={4}>
        <Text size="sm" id="touch-direction-label">
          Segmented selector
        </Text>
        <SegmentedControl
          aria-labelledby="touch-direction-label"
          data={['All', 'Inflows', 'Outflows']}
          disabled={disabled}
        />
      </Stack>
      <Group gap={4}>
        <Checkbox aria-label="Select row" disabled={disabled} />
        <Checkbox label="Include archived" disabled={disabled} />
        <Radio
          name="touch-choice"
          value="sample"
          label="Sample choice"
          disabled={disabled}
        />
      </Group>
      <Switch label="Enable notifications" disabled={disabled} />
      <AccountSelect
        label="Account"
        data={[{ value: 'cash', label: 'Everyday account' }]}
        value={account}
        onChange={setAccount}
        disabled={disabled}
      />
      <CategorySelect
        label="Category"
        data={[{ value: 'food', primary: 'Food', secondary: 'Groceries' }]}
        value={category}
        onChange={setCategory}
        disabled={disabled}
      />
      <NumberInput
        label="Day of month"
        min={1}
        max={31}
        defaultValue={15}
        disabled={disabled}
      />
    </Stack>
  )
}

function InteractionSurfaces({ state }: ExampleProps) {
  const [period, setPeriod] = useState(
    state === 'extended' ? TimePeriod.threeYears : TimePeriod.year,
  )
  const [dates, setDates] = useState<DatesRangeValue>([null, null])
  const disabled = state === 'disabled'
  return (
    <Stack>
      <Text fw={600}>Range selection and interface surfaces</Text>
      <Text size="sm" c="dimmed">
        Hover M beside selected Y, then hover the selection. Open More periods
        and use the arrow keys. Tab through the remaining controls to check
        focus. Disabled applies to the sample controls; the production range has
        no disabled state.
      </Text>
      <HomePeriodControl period={period} onChange={setPeriod} />
      <DateRangeControl value={dates} onChange={setDates} />
      <Paper withBorder p="md">
        <Stack>
          <Text>Raised card with secondary actions</Text>
          <Group>
            <Button variant="subtle" color="gray" disabled={disabled}>
              Secondary action
            </Button>
            <Button variant="default" disabled={disabled}>
              Default action
            </Button>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="More actions"
              disabled={disabled}
            >
              …
            </ActionIcon>
            <CloseButton aria-label="Close sample" disabled={disabled} />
          </Group>
          <TextInput
            label="Input surface"
            placeholder="Account name"
            disabled={disabled}
          />
          <Select
            label="Picker surface"
            data={['Everyday', 'Savings', 'Investment']}
            defaultValue="Everyday"
            disabled={disabled}
          />
          <SegmentedControl data={['List', 'Cards']} disabled={disabled} />
          <NavLink label="Unselected navigation" disabled={disabled} />
          <NavLink label="Selected navigation" active disabled={disabled} />
          <Tabs defaultValue="overview">
            <Tabs.List>
              <Tabs.Tab value="overview" disabled={disabled}>
                Overview
              </Tabs.Tab>
              <Tabs.Tab value="history" disabled={disabled}>
                History
              </Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Group>
            <LifecycleBadge status="Archived" />
            <Button variant="light" color="red" disabled={disabled}>
              Destructive action
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  )
}

function Controls({ state }: ExampleProps) {
  const [value, setValue] = useState('125.00')
  const [navigationOpened, setNavigationOpened] = useState(false)
  const [action, setAction] = useState('No action yet')
  const [dates, setDates] = useState<DatesRangeValue>([null, null])
  const disabled = state === 'pending'
  return (
    <Stack>
      <PageHeader title="Controls" />
      <Stack gap={4}>
        <Text fw={600} id="control-direction-label">
          Segmented selector
        </Text>
        <SegmentedControl
          aria-labelledby="control-direction-label"
          data={['All', 'Inflows', 'Outflows']}
          defaultValue="All"
          disabled={disabled}
        />
      </Stack>
      <Text fw={600}>Inputs</Text>
      <TextInput
        label="Account name"
        defaultValue="Everyday account"
        disabled={state === 'pending'}
        error={state === 'error' ? 'Enter a unique name' : undefined}
      />
      <DecimalInput
        label="Balance"
        value={value}
        onChange={setValue}
        disabled={disabled}
      />
      <Select
        label="Currency"
        data={['USD', 'SGD', 'EUR']}
        defaultValue="USD"
        searchable
        disabled={disabled}
      />
      <MultiSelect
        label="Accounts"
        data={['Everyday', 'Savings', 'Investment']}
        defaultValue={['Everyday']}
        searchable
        clearable
        disabled={disabled}
      />
      <Autocomplete
        label="Institution"
        data={['Example Bank', 'Example Brokerage']}
        placeholder="Start typing"
        disabled={disabled}
      />
      <NumberInput
        label="Day of month"
        min={1}
        max={31}
        defaultValue={15}
        disabled={disabled}
      />
      <Textarea
        label="Notes"
        placeholder="Optional notes"
        autosize
        minRows={2}
        disabled={disabled}
      />
      <ColorInput
        label="Category color"
        defaultValue="#83b59b"
        disabled={disabled}
      />
      <FileInput
        label="Local file selection"
        placeholder="Choose a file"
        clearable
        disabled={disabled}
        description="Preview only; files are not uploaded."
      />
      <Text fw={600}>Choices</Text>
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
      <Text fw={600}>Buttons and menus</Text>
      <Group>
        <Button loading={disabled} onClick={() => setAction('Save selected')}>
          Save changes
        </Button>
        <Button
          variant="default"
          disabled={disabled}
          onClick={() => setAction('Cancel selected')}
        >
          Cancel
        </Button>
        <Button
          variant="light"
          disabled={disabled}
          onClick={() => setAction('Light action selected')}
        >
          Light
        </Button>
        <Button
          variant="subtle"
          disabled={disabled}
          onClick={() => setAction('Subtle action selected')}
        >
          Subtle
        </Button>
      </Group>
      <Group gap="xs">
        <ActionIcon
          aria-label="Edit sample"
          variant="subtle"
          disabled={disabled}
          onClick={() => setAction('Edit selected')}
        >
          <Pencil size={20} />
        </ActionIcon>
        <CloseButton
          aria-label="Close sample"
          disabled={disabled}
          onClick={() => setAction('Close selected')}
        />
        <Burger
          aria-label="Toggle sample navigation"
          opened={navigationOpened}
          onClick={() => setNavigationOpened(!navigationOpened)}
          disabled={disabled}
          size="sm"
        />
        <Menu withinPortal>
          <Menu.Target>
            <ActionIcon
              aria-label="Sample actions"
              variant="subtle"
              disabled={disabled}
            >
              <MoreHorizontal size={20} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Pencil size={20} />}
              onClick={() => setAction('Menu edit selected')}
            >
              Edit
            </Menu.Item>
            <Menu.Item
              leftSection={<Download size={20} />}
              onClick={() => setAction('Menu export selected')}
            >
              Export
            </Menu.Item>
            <Menu.Item disabled>Unavailable action</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Text size="sm" c="dimmed" aria-live="polite">
        {action}
      </Text>
      <Text fw={600}>Navigation</Text>
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview" disabled={disabled}>
            Overview
          </Tabs.Tab>
          <Tabs.Tab value="history" disabled={disabled}>
            History
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview" pt="xs">
          <Text size="sm">Overview content</Text>
        </Tabs.Panel>
        <Tabs.Panel value="history" pt="xs">
          <Text size="sm">History content</Text>
        </Tabs.Panel>
      </Tabs>
      <NavLink
        label="Selected navigation"
        active
        disabled={disabled}
        onClick={() => setAction('Navigation selected')}
      />
      <NavLink
        label="Other navigation"
        disabled={disabled}
        onClick={() => setAction('Other navigation selected')}
      />
      <Text fw={600}>Dates</Text>
      <Text size="sm" c="dimmed">
        Date controls retain their normal interactive behavior in all preview
        states.
      </Text>
      <DateRangeControl value={dates} onChange={setDates} clearable />
      <Text fw={600}>Status</Text>
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
        loadingFallback={
          <Group p="md">
            <Skeleton h={22} flex={1} />
            <Skeleton h={22} w={80} />
          </Group>
        }
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
        loadingFallback={null} // This example always retains its live Chart.
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
  ...typographyExamples,
  {
    id: 'touch-controls',
    title: 'Compact touch targets',
    component: TouchControls,
    states: ['ready', 'disabled'],
    components: [
      'PageActions',
      'HomePeriodControl',
      'AccountSelect',
      'CategorySelect',
    ],
  },
  {
    id: 'interaction-surfaces',
    title: 'Tinted interaction surfaces',
    component: InteractionSurfaces,
    states: ['ready', 'extended', 'disabled'],
    components: ['HomePeriodControl'],
  },
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
  ...notificationExamples,
  ...investmentExamples,
  ...categoryExamples,
  {
    id: 'controls',
    title: 'Controls and status',
    component: Controls,
    states: ['ready', 'pending', 'error'],
    components: [
      'PageHeader',
      'DecimalInput',
      'LifecycleBadge',
      'DateRangeControl',
    ],
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
