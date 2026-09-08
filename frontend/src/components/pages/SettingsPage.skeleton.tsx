import {
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
} from '@mantine/core'
import { normalizeAppearance } from '../../lib/appearance-preferences'
import { LoadingSkeleton } from '../loading/LoadingSkeleton'
import { AppearanceControl } from '../settings/AppearanceControl'
import { AccessTokensSkeleton } from '../settings/PersonalAccessTokenSection.skeleton'
import { SettingsSectionSkeleton } from '../settings/SettingsSection.skeleton'
import {
  GeneralSettingsFrame,
  NotificationSettingsFrame,
  SettingsPageFrame,
} from './SettingsPageFrame'
import styles from './SettingsPage.module.css'
import type { AppearancePreference } from '../../lib/design-system/appearance'
import type { SettingsTab } from '../../lib/route-search'

const noop = () => {}
export function GeneralSettingsSkeleton({
  appearance,
}: { appearance?: AppearancePreference } = {}) {
  return (
    <GeneralSettingsFrame
      appearance={
        <AppearanceControl
          withHeading
          value={normalizeAppearance(appearance)}
          onChange={noop}
          disabled
        />
      }
      currency={
        <>
          <Title data-typography="sectionHeading" order={4} mb="xs">
            Display currency
          </Title>
          <Select
            disabled
            aria-label="Display currency"
            placeholder="Select currency"
            size="md"
            data={[]}
          />
          <Text data-typography="metadata" c="dimmed" mt={4}>
            All balances and amounts use this currency.
          </Text>
        </>
      }
      timezone={
        <>
          <Group justify="space-between" gap="xs" mb={4}>
            <Title data-typography="sectionHeading" order={4}>
              Timezone
            </Title>
            <Button variant="light" size="sm" disabled>
              Use browser
            </Button>
          </Group>
          <Select
            disabled
            aria-label="Timezone"
            placeholder="Select timezone"
            size="md"
            data={[]}
          />
          <Text data-typography="metadata" c="dimmed" mt={4}>
            Dates and times use this timezone.
          </Text>
        </>
      }
      preferences={
        <>
          <Switch disabled label="Hide zero balances on Home" />
          <Switch disabled label="Use monospace font for amounts" />
        </>
      }
      actions={
        <Group justify="flex-end">
          <Button disabled variant="default">
            Cancel
          </Button>
          <Button disabled>Save changes</Button>
        </Group>
      }
    />
  )
}
export function NotificationSettingsSkeleton() {
  return (
    <NotificationSettingsFrame
      device={
        <>
          <Title data-typography="sectionHeading" order={4}>
            Notifications
          </Title>
          <Switch disabled label="Enable notifications on this device" />
          <Text data-typography="metadata" c="dimmed" mih={42}>
            Checking device notification status…
          </Text>
        </>
      }
      transactions={
        <>
          <Title data-typography="sectionHeading" order={4}>
            Transactions
          </Title>
          <Switch disabled label="New uncategorized transactions" />
          <Switch disabled label="Bank connections need attention" />
        </>
      }
    />
  )
}
export function SettingsPageSkeleton({
  tab = 'general',
  appearance,
}: {
  tab?: SettingsTab
  appearance?: AppearancePreference
}) {
  return (
    <SettingsPageFrame tab={tab} onChange={noop}>
      <Tabs.Panel
        value={tab}
        className={
          ['general', 'notifications', 'access'].includes(tab)
            ? undefined
            : styles.categoriesPanel
        }
      >
        <LoadingSkeleton label="Loading settings…">
          {tab === 'general' ? (
            <GeneralSettingsSkeleton appearance={appearance} />
          ) : tab === 'notifications' ? (
            <NotificationSettingsSkeleton />
          ) : tab === 'access' ? (
            <AccessTokensSkeleton />
          ) : tab === 'analysis' ? (
            <Stack gap="lg">
              <Paper withBorder p="lg" radius="md">
                <Stack gap="sm">
                  <Title data-typography="sectionHeading" order={4}>
                    Analysis display
                  </Title>
                  <Switch
                    disabled
                    label="Use Sankey diagram on Analysis"
                    description="Replace separate inflow and outflow charts with one cashflow diagram."
                  />
                </Stack>
              </Paper>
              <SettingsSectionSkeleton section="analysis" />
            </Stack>
          ) : (
            <SettingsSectionSkeleton section={tab} />
          )}
        </LoadingSkeleton>
      </Tabs.Panel>
    </SettingsPageFrame>
  )
}
