import {
  Alert,
  Box,
  Button,
  ColorSwatch,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { lazy, useEffect, useMemo, useRef, useState } from 'react'
import { loadSettingsSection } from '../../lib/queries/settings'
import {
  prepareSettingsCode,
  settingsFeatureLoaders,
} from '../../lib/feature-loaders'
import {
  AccessTokensSkeleton,
  LoadingSkeleton,
  SettingsSkeleton,
} from '../loading/LoadingSkeleton'
import { useSettingsMutation } from '../../hooks/useSettingsMutation'
import { useCurrentUser } from '../../lib/session'
import { invalidateMutationFamilies } from '../../lib/query-invalidation'
import { DeferredFeature } from '../DeferredFeature'
import { getUserControllerMeQueryOptions } from '../../api/clients/spliceAPI'
import { PageHeader } from '../PageHeader'
import {
  THEME_PRESETS,
  applyThemePresetId,
  normalizeThemePresetId,
  previewThemePresetId,
} from '../../lib/theme'
import {
  disableCurrentDeviceNotifications,
  enableCurrentDeviceNotifications,
  loadCurrentDeviceNotificationState,
} from '../../lib/notifications/browser-push'
import styles from './SettingsPage.module.css'
import type { NotificationSupportStatus } from '../../lib/notifications/browser-push'
import type { ThemePreset, ThemePresetId } from '../../lib/theme'

import type { SettingsTab } from '../../lib/route-search'

const AnalysisRulesSection = lazy(settingsFeatureLoaders.analysis)
const CategorizationRulesSection = lazy(settingsFeatureLoaders.categorization)
const CustomCategoriesSection = lazy(settingsFeatureLoaders.categories)
const PersonalAccessTokenSection = lazy(settingsFeatureLoaders.access)
const RecurringManualTransactionsSection = lazy(
  settingsFeatureLoaders.recurring,
)

type GeneralSettingsValues = {
  theme: ThemePresetId
  currency: string
  timezone: string
  hideZeroBalanceAccounts: boolean
}

// Common currencies - curated list for better UX
const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD - US dollar' },
  { value: 'EUR', label: 'EUR - euro' },
  { value: 'GBP', label: 'GBP - British pound' },
  { value: 'JPY', label: 'JPY - Japanese yen' },
  { value: 'CAD', label: 'CAD - Canadian dollar' },
  { value: 'AUD', label: 'AUD - Australian dollar' },
  { value: 'CHF', label: 'CHF - Swiss franc' },
  { value: 'CNY', label: 'CNY - Chinese yuan' },
  { value: 'INR', label: 'INR - Indian rupee' },
  { value: 'MXN', label: 'MXN - Mexican peso' },
  { value: 'BRL', label: 'BRL - Brazilian real' },
  { value: 'KRW', label: 'KRW - South Korean won' },
  { value: 'SGD', label: 'SGD - Singapore dollar' },
  { value: 'HKD', label: 'HKD - Hong Kong dollar' },
  { value: 'NZD', label: 'NZD - New Zealand dollar' },
  { value: 'SEK', label: 'SEK - Swedish krona' },
  { value: 'NOK', label: 'NOK - Norwegian krone' },
  { value: 'DKK', label: 'DKK - Danish krone' },
  { value: 'ZAR', label: 'ZAR - South African rand' },
  { value: 'THB', label: 'THB - Thai baht' },
]

// Get all IANA timezones from the browser
function getTimezoneOptions() {
  try {
    const timezones = Intl.supportedValuesOf('timeZone')
    return timezones.map((tz) => ({
      value: tz,
      label: tz.replace(/_/g, ' '),
    }))
  } catch {
    // Fallback for older browsers
    return [
      { value: 'UTC', label: 'UTC' },
      { value: 'America/New_York', label: 'America/New York' },
      { value: 'America/Chicago', label: 'America/Chicago' },
      { value: 'America/Denver', label: 'America/Denver' },
      { value: 'America/Los_Angeles', label: 'America/Los Angeles' },
      { value: 'Europe/London', label: 'Europe/London' },
      { value: 'Europe/Paris', label: 'Europe/Paris' },
      { value: 'Europe/Berlin', label: 'Europe/Berlin' },
      { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
      { value: 'Asia/Shanghai', label: 'Asia/Shanghai' },
      { value: 'Asia/Singapore', label: 'Asia/Singapore' },
      { value: 'Australia/Sydney', label: 'Australia/Sydney' },
    ]
  }
}

// Get the user's browser timezone
function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function ThemePresetOption({
  preset,
  selected,
  onSelect,
}: {
  preset: ThemePreset
  selected: boolean
  onSelect: (theme: ThemePresetId) => void
}) {
  return (
    <UnstyledButton
      role="radio"
      aria-checked={selected}
      aria-label={preset.label}
      className={styles.themePresetOption}
      data-selected={selected}
      onClick={() => onSelect(preset.id)}
      p="sm"
    >
      <Stack gap={8}>
        <Group justify="space-between" gap="sm" wrap="nowrap">
          <Group gap={4} aria-hidden>
            {preset.swatches.map((swatch) => (
              <ColorSwatch
                key={swatch}
                color={swatch}
                className={styles.themeSwatch}
                size={18}
                withShadow={false}
              />
            ))}
          </Group>
          <Box
            aria-hidden
            className={styles.themeCheck}
            data-selected={selected}
          >
            <Check size={16} strokeWidth={3} />
          </Box>
        </Group>
        <Box>
          <Text fw={600} size="sm">
            {preset.label}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={2}>
            {preset.description}
          </Text>
        </Box>
      </Stack>
    </UnstyledButton>
  )
}

type UserSettingsWithNotifications = {
  notifications?: {
    transactions?: {
      newSyncedTransactions?: boolean | null
    } | null
    bankLinks?: {
      needsAttention?: boolean | null
    } | null
  } | null
}

function getNewSyncedTransactionsEnabled(
  settings: UserSettingsWithNotifications | null | undefined,
): boolean {
  return settings?.notifications?.transactions?.newSyncedTransactions ?? false
}

function getBankLinkNeedsAttentionEnabled(
  settings: UserSettingsWithNotifications | null | undefined,
): boolean {
  return settings?.notifications?.bankLinks?.needsAttention ?? false
}

function getNotificationSupportMessage(status: NotificationSupportStatus) {
  switch (status) {
    case 'unsupported':
      return 'This browser does not support push notifications.'
    case 'denied':
      return 'Notifications are blocked in this browser.'
    case 'unconfigured':
      return 'Push notifications are not configured for this environment.'
    case 'supported':
      return null
  }
}

export function SettingsPage({
  tab = 'general',
  onTabChange,
}: {
  tab?: SettingsTab
  onTabChange?: (tab: SettingsTab) => void
}) {
  const queryClient = useQueryClient()
  const { data: user, isLoading, error } = useCurrentUser()
  const updateSettingsMutation = useSettingsMutation()
  const updateAnalysisSankeyMutation = useSettingsMutation()
  const updateLookaroundMutation = useSettingsMutation()
  const updateNotificationsMutation = useSettingsMutation()
  const [selectedTab, setSelectedTab] = useState<SettingsTab>(tab)
  const tabListRef = useRef<HTMLDivElement>(null)

  const timezoneOptions = useMemo(() => getTimezoneOptions(), [])
  const browserTimezone = useMemo(() => getBrowserTimezone(), [])

  const [theme, setTheme] = useState<ThemePresetId>(() =>
    normalizeThemePresetId(user?.settings.theme),
  )
  const [currency, setCurrency] = useState<string>(
    user?.settings.currency ?? 'USD',
  )
  const [timezone, setTimezone] = useState<string>(
    user?.settings.timezone ?? 'UTC',
  )
  const [hideZeroBalanceAccounts, setHideZeroBalanceAccounts] = useState(
    user?.settings.hideZeroBalanceAccounts ?? false,
  )
  const [analysisSankeyEnabled, setAnalysisSankeyEnabled] = useState(
    user?.settings.analysisSankeyEnabled ?? false,
  )
  const [analysisSankeyError, setAnalysisSankeyError] = useState<string | null>(
    null,
  )
  const [notificationSupportStatus, setNotificationSupportStatus] =
    useState<NotificationSupportStatus>('supported')
  const [deviceNotificationsEnabled, setDeviceNotificationsEnabled] =
    useState(false)
  const [deviceNotificationsLoading, setDeviceNotificationsLoading] =
    useState(true)
  const [deviceNotificationsPending, setDeviceNotificationsPending] =
    useState(false)
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  )
  const [newSyncedTransactionsEnabled, setNewSyncedTransactionsEnabled] =
    useState(() => getNewSyncedTransactionsEnabled(user?.settings ?? {}))
  const [newSyncedTransactionsPending, setNewSyncedTransactionsPending] =
    useState(false)
  const [bankLinkNeedsAttentionEnabled, setBankLinkNeedsAttentionEnabled] =
    useState(() => getBankLinkNeedsAttentionEnabled(user?.settings ?? {}))
  const [bankLinkNeedsAttentionPending, setBankLinkNeedsAttentionPending] =
    useState(false)
  const [settingsBaseline, setSettingsBaseline] =
    useState<GeneralSettingsValues | null>(() =>
      user ? { theme, currency, timezone, hideZeroBalanceAccounts } : null,
    )
  const settingsBaselineRef = useRef<GeneralSettingsValues | null>(
    settingsBaseline,
  )
  const latestServerGeneralSettingsRef = useRef<GeneralSettingsValues | null>(
    settingsBaseline,
  )
  const generalDraftRef = useRef<GeneralSettingsValues>({
    theme,
    currency,
    timezone,
    hideZeroBalanceAccounts,
  })
  generalDraftRef.current = {
    theme,
    currency,
    timezone,
    hideZeroBalanceAccounts,
  }
  const hasChanges =
    settingsBaseline !== null &&
    (theme !== settingsBaseline.theme ||
      currency !== settingsBaseline.currency ||
      timezone !== settingsBaseline.timezone ||
      hideZeroBalanceAccounts !== settingsBaseline.hideZeroBalanceAccounts)

  // Adopt server values only while the General form is clean. Unrelated
  // immediate-save refetches must not replace an in-progress draft.
  useEffect(() => {
    if (user?.settings) {
      const nextGeneralSettings: GeneralSettingsValues = {
        theme: normalizeThemePresetId(user.settings.theme),
        currency: user.settings.currency ?? 'USD',
        timezone: user.settings.timezone ?? 'UTC',
        hideZeroBalanceAccounts: user.settings.hideZeroBalanceAccounts ?? false,
      }
      latestServerGeneralSettingsRef.current = nextGeneralSettings
      const currentBaseline = settingsBaselineRef.current
      const currentDraft = generalDraftRef.current
      const draftIsDirty =
        currentBaseline !== null &&
        (currentDraft.theme !== currentBaseline.theme ||
          currentDraft.currency !== currentBaseline.currency ||
          currentDraft.timezone !== currentBaseline.timezone ||
          currentDraft.hideZeroBalanceAccounts !==
            currentBaseline.hideZeroBalanceAccounts)

      if (!draftIsDirty) {
        settingsBaselineRef.current = nextGeneralSettings
        setSettingsBaseline(nextGeneralSettings)
        setTheme(nextGeneralSettings.theme)
        applyThemePresetId(nextGeneralSettings.theme)
        setCurrency(nextGeneralSettings.currency)
        setTimezone(nextGeneralSettings.timezone)
        setHideZeroBalanceAccounts(nextGeneralSettings.hideZeroBalanceAccounts)
      }

      if (!updateAnalysisSankeyMutation.isPending)
        setAnalysisSankeyEnabled(user.settings.analysisSankeyEnabled ?? false)
      if (!newSyncedTransactionsPending)
        setNewSyncedTransactionsEnabled(
          getNewSyncedTransactionsEnabled(
            user.settings as UserSettingsWithNotifications,
          ),
        )
      if (!bankLinkNeedsAttentionPending)
        setBankLinkNeedsAttentionEnabled(
          getBankLinkNeedsAttentionEnabled(
            user.settings as UserSettingsWithNotifications,
          ),
        )
    }
  }, [
    user?.settings,
    updateAnalysisSankeyMutation.isPending,
    newSyncedTransactionsPending,
    bankLinkNeedsAttentionPending,
  ])

  useEffect(() => {
    if (isLoading) return

    const activeTab = tabListRef.current?.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    )
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [isLoading, selectedTab])

  // A refetch may arrive while the draft is dirty. If the user later reverts
  // every field to the old baseline, adopt the already-cached server values at
  // that clean transition instead of leaving an obsolete clean-looking form.
  useEffect(() => {
    if (hasChanges || settingsBaselineRef.current === null) return

    const latestServerSettings = latestServerGeneralSettingsRef.current
    const currentDraft = generalDraftRef.current
    if (
      !latestServerSettings ||
      (currentDraft.theme === latestServerSettings.theme &&
        currentDraft.currency === latestServerSettings.currency &&
        currentDraft.timezone === latestServerSettings.timezone &&
        currentDraft.hideZeroBalanceAccounts ===
          latestServerSettings.hideZeroBalanceAccounts)
    ) {
      return
    }

    settingsBaselineRef.current = latestServerSettings
    setSettingsBaseline(latestServerSettings)
    setTheme(latestServerSettings.theme)
    applyThemePresetId(latestServerSettings.theme)
    setCurrency(latestServerSettings.currency)
    setTimezone(latestServerSettings.timezone)
    setHideZeroBalanceAccounts(latestServerSettings.hideZeroBalanceAccounts)
  }, [hasChanges])

  useEffect(() => {
    let cancelled = false

    async function loadNotificationState() {
      setDeviceNotificationsLoading(true)
      setNotificationError(null)

      try {
        const state = await loadCurrentDeviceNotificationState()
        if (!cancelled) {
          setNotificationSupportStatus(state.supported)
          setDeviceNotificationsEnabled(state.subscribed)
        }
      } catch {
        if (!cancelled) {
          setNotificationError('Failed to load notification status')
          setDeviceNotificationsEnabled(false)
        }
      } finally {
        if (!cancelled) {
          setDeviceNotificationsLoading(false)
        }
      }
    }

    void loadNotificationState()

    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = () => {
    const savedTheme = settingsBaseline?.theme ?? 'splice-dark'
    const submittedSettings = {
      theme,
      currency,
      timezone,
      hideZeroBalanceAccounts,
    }

    updateSettingsMutation.mutate(
      { data: submittedSettings },
      {
        onSuccess: () => {
          applyThemePresetId(theme)
          latestServerGeneralSettingsRef.current = submittedSettings
          settingsBaselineRef.current = submittedSettings
          setSettingsBaseline(submittedSettings)
          // Invalidate user query to refresh the data
          invalidateMutationFamilies(queryClient, ['user'])
        },
        onError: () => {
          previewThemePresetId(savedTheme)
        },
      },
    )
  }

  const handleSetBrowserTimezone = () => {
    setTimezone(browserTimezone)
  }

  const handleThemeSelect = (nextTheme: ThemePresetId) => {
    setTheme(nextTheme)
    previewThemePresetId(nextTheme)
  }

  const handleSaveNeutralizationLookaround = async (days: number) => {
    await updateLookaroundMutation.mutateAsync({
      data: { neutralizationLookaroundDays: days },
    })
    await invalidateMutationFamilies(queryClient, ['user'])
  }

  const handleAnalysisSankeyChange = async (checked: boolean) => {
    const previousValue = analysisSankeyEnabled
    setAnalysisSankeyEnabled(checked)
    setAnalysisSankeyError(null)

    try {
      await updateAnalysisSankeyMutation.mutateAsync({
        data: { analysisSankeyEnabled: checked },
      })
      await invalidateMutationFamilies(queryClient, ['user'])
    } catch {
      setAnalysisSankeyEnabled(previousValue)
      setAnalysisSankeyError('Failed to save Sankey diagram setting')
    }
  }

  const handleDeviceNotificationsChange = async (checked: boolean) => {
    setDeviceNotificationsPending(true)
    setNotificationError(null)

    try {
      if (checked) {
        await enableCurrentDeviceNotifications()
        setDeviceNotificationsEnabled(true)
        await queryClient.invalidateQueries({
          queryKey: getUserControllerMeQueryOptions().queryKey,
        })
      } else {
        await disableCurrentDeviceNotifications()
        setDeviceNotificationsEnabled(false)
      }
    } catch (err) {
      setNotificationError(
        err instanceof Error
          ? err.message
          : 'Failed to update notification status',
      )
    } finally {
      setDeviceNotificationsPending(false)
    }
  }

  const handleNewSyncedTransactionsChange = async (checked: boolean) => {
    const previousValue = newSyncedTransactionsEnabled
    setNewSyncedTransactionsEnabled(checked)
    setNewSyncedTransactionsPending(true)
    setNotificationError(null)

    try {
      await updateNotificationsMutation.mutateAsync({
        data: {
          notifications: { transactions: { newSyncedTransactions: checked } },
        },
      })
      await invalidateMutationFamilies(queryClient, ['user'])
    } catch {
      setNewSyncedTransactionsEnabled(previousValue)
      setNotificationError('Failed to save notification preference')
    } finally {
      setNewSyncedTransactionsPending(false)
    }
  }

  const handleBankLinkNeedsAttentionChange = async (checked: boolean) => {
    const previousValue = bankLinkNeedsAttentionEnabled
    setBankLinkNeedsAttentionEnabled(checked)
    setBankLinkNeedsAttentionPending(true)
    setNotificationError(null)

    try {
      await updateNotificationsMutation.mutateAsync({
        data: { notifications: { bankLinks: { needsAttention: checked } } },
      })
      await invalidateMutationFamilies(queryClient, ['user'])
    } catch {
      setBankLinkNeedsAttentionEnabled(previousValue)
      setNotificationError('Failed to save notification preference')
    } finally {
      setBankLinkNeedsAttentionPending(false)
    }
  }

  useEffect(() => {
    setSelectedTab(tab)
  }, [tab])

  const prepareTab = (nextTab: SettingsTab) => {
    prepareSettingsCode(nextTab)
    // Token inventory is refreshed only by selecting Access, never by speculation.
    if (nextTab !== 'access') void loadSettingsSection(queryClient, nextTab)
  }
  const tabIntent = (nextTab: SettingsTab) => ({
    onPointerEnter: () => prepareTab(nextTab),
    onFocus: () => prepareTab(nextTab),
    onTouchStart: () => prepareTab(nextTab),
  })

  const handleTabChange = (value: string | null) => {
    const nextTab = (value ?? 'general') as SettingsTab
    prepareTab(nextTab)
    setSelectedTab(nextTab)

    onTabChange?.(nextTab)
  }

  if (isLoading) {
    return (
      <LoadingSkeleton label="Loading settings…">
        <SettingsSkeleton />
      </LoadingSkeleton>
    )
  }

  if (error && !user) {
    return (
      <Alert color="red" title="Error">
        Failed to load settings
      </Alert>
    )
  }

  return (
    <Box className={styles.settingsPage}>
      <PageHeader title="Settings" />

      <Tabs
        className={styles.settingsTabs}
        classNames={{ panel: styles.settingsPanel }}
        value={selectedTab}
        onChange={handleTabChange}
        keepMounted={false}
      >
        <div className={styles.settingsTabScroller}>
          <Tabs.List ref={tabListRef} className={styles.settingsTabList}>
            <Tabs.Tab value="general" {...tabIntent('general')}>
              General
            </Tabs.Tab>
            <Tabs.Tab value="notifications" {...tabIntent('notifications')}>
              Notifications
            </Tabs.Tab>
            <Tabs.Tab value="access" {...tabIntent('access')}>
              Access
            </Tabs.Tab>
            <Tabs.Tab value="categories" {...tabIntent('categories')}>
              Categories
            </Tabs.Tab>
            <Tabs.Tab value="analysis" {...tabIntent('analysis')}>
              Analysis
            </Tabs.Tab>
            <Tabs.Tab value="categorization" {...tabIntent('categorization')}>
              Categorization
            </Tabs.Tab>
            <Tabs.Tab value="recurring" {...tabIntent('recurring')}>
              Recurring
            </Tabs.Tab>
          </Tabs.List>
        </div>

        <Tabs.Panel value="general">
          <Paper
            withBorder
            p="lg"
            radius="md"
            maw={720}
            data-testid="settings-card"
          >
            <Stack gap="lg">
              <div>
                <Title order={4} mb="xs">
                  Appearance
                </Title>
                <Text size="sm" c="dimmed" mb="sm">
                  Choose your theme.
                </Text>
                <SimpleGrid
                  cols={{ base: 1, sm: 2 }}
                  spacing="sm"
                  role="radiogroup"
                  aria-label="Theme"
                >
                  {THEME_PRESETS.map((preset) => (
                    <ThemePresetOption
                      key={preset.id}
                      preset={preset}
                      selected={theme === preset.id}
                      onSelect={handleThemeSelect}
                    />
                  ))}
                </SimpleGrid>
              </div>

              <div>
                <Title order={4} mb="xs">
                  Display currency
                </Title>
                <Text size="sm" c="dimmed" mb="sm">
                  All balances and amounts will be converted to this currency
                  for display.
                </Text>
                <Select
                  value={currency}
                  onChange={(value) => value && setCurrency(value)}
                  data={CURRENCY_OPTIONS}
                  searchable
                  size="md"
                  placeholder="Select currency"
                />
              </div>

              <div>
                <Title order={4} mb="xs">
                  Timezone
                </Title>
                <Text size="sm" c="dimmed" mb="sm">
                  Used for displaying dates and times throughout the app.
                </Text>
                <Group gap="sm" align="flex-end">
                  <Select
                    value={timezone}
                    onChange={(value) => value && setTimezone(value)}
                    data={timezoneOptions}
                    searchable
                    size="md"
                    placeholder="Select timezone"
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="light"
                    size="sm"
                    onClick={handleSetBrowserTimezone}
                    disabled={timezone === browserTimezone}
                  >
                    Use browser
                  </Button>
                </Group>
                {browserTimezone && (
                  <Text size="xs" c="dimmed" mt="xs">
                    Detected: {browserTimezone}
                  </Text>
                )}
              </div>

              <div>
                <Title order={4} mb="xs">
                  Home dashboard
                </Title>
                <Text size="sm" c="dimmed" mb="sm">
                  Hide zero-balance accounts from the Assets and Liabilities
                  sections on Home.
                </Text>
                <Switch
                  label="Hide 0 balance accounts"
                  checked={hideZeroBalanceAccounts}
                  onChange={(event) =>
                    setHideZeroBalanceAccounts(event.currentTarget.checked)
                  }
                />
              </div>

              <Group justify="flex-end" mt="md">
                <Button
                  onClick={handleSave}
                  loading={updateSettingsMutation.isPending}
                  disabled={!hasChanges}
                >
                  Save changes
                </Button>
              </Group>

              {updateSettingsMutation.isError && (
                <Alert color="red" title="Error">
                  Failed to save settings
                </Alert>
              )}

              {updateSettingsMutation.isSuccess && !hasChanges && (
                <Alert color="green" title="Success">
                  Settings saved successfully
                </Alert>
              )}
            </Stack>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="notifications">
          <Stack gap="lg" maw={720}>
            <Paper withBorder p="lg" radius="md">
              <Stack gap="sm">
                <Title order={4}>Notifications</Title>
                <Switch
                  label="Enable notifications on this device"
                  checked={deviceNotificationsEnabled}
                  disabled={
                    deviceNotificationsLoading ||
                    deviceNotificationsPending ||
                    notificationSupportStatus !== 'supported'
                  }
                  onChange={(event) => {
                    void handleDeviceNotificationsChange(
                      event.currentTarget.checked,
                    )
                  }}
                />
                <Text c="dimmed" size="sm" mih={42} aria-live="polite">
                  {getNotificationSupportMessage(notificationSupportStatus) ??
                    'Device notifications are configured separately in each browser.'}
                </Text>
              </Stack>
            </Paper>

            <Paper withBorder p="lg" radius="md">
              <Stack gap="sm">
                <Title order={4}>Transactions</Title>
                <Switch
                  label="New uncategorized transactions"
                  checked={newSyncedTransactionsEnabled}
                  disabled={newSyncedTransactionsPending || !user?.settings}
                  onChange={(event) => {
                    void handleNewSyncedTransactionsChange(
                      event.currentTarget.checked,
                    )
                  }}
                />
                <Switch
                  label="Bank connections need attention"
                  checked={bankLinkNeedsAttentionEnabled}
                  disabled={bankLinkNeedsAttentionPending || !user?.settings}
                  onChange={(event) => {
                    void handleBankLinkNeedsAttentionChange(
                      event.currentTarget.checked,
                    )
                  }}
                />
              </Stack>
            </Paper>

            {notificationError && (
              <Alert color="red" title="Error">
                {notificationError}
              </Alert>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="access">
          <DeferredFeature
            label="Settings section"
            fallback={
              <LoadingSkeleton label="Loading settings section…">
                <AccessTokensSkeleton />
              </LoadingSkeleton>
            }
          >
            <PersonalAccessTokenSection />
          </DeferredFeature>
        </Tabs.Panel>

        <Tabs.Panel className={styles.categoriesPanel} value="categories">
          <DeferredFeature
            label="Settings section"
            fallback={
              <LoadingSkeleton label="Loading settings section…">
                <SettingsSkeleton section="categories" />
              </LoadingSkeleton>
            }
          >
            <CustomCategoriesSection />
          </DeferredFeature>
        </Tabs.Panel>

        <Tabs.Panel className={styles.categoriesPanel} value="analysis">
          <Stack gap="lg">
            <Paper withBorder p="lg" radius="md">
              <Stack gap="sm">
                <Title order={4}>Analysis display</Title>
                <Switch
                  label="Use Sankey diagram on Analysis"
                  description="Replace separate inflow and outflow charts with one cashflow diagram."
                  checked={analysisSankeyEnabled}
                  disabled={updateAnalysisSankeyMutation.isPending}
                  onChange={(event) => {
                    void handleAnalysisSankeyChange(event.currentTarget.checked)
                  }}
                />
                {analysisSankeyError && (
                  <Alert color="red" title="Error">
                    {analysisSankeyError}
                  </Alert>
                )}
              </Stack>
            </Paper>
            <DeferredFeature
              label="Analysis rules"
              fallback={
                <LoadingSkeleton label="Loading analysis rules…">
                  <SettingsSkeleton section="analysis" />
                </LoadingSkeleton>
              }
            >
              <AnalysisRulesSection
                lookaroundSetting={{
                  value: user?.settings.neutralizationLookaroundDays ?? 60,
                  isSaving: updateLookaroundMutation.isPending,
                  onSave: handleSaveNeutralizationLookaround,
                }}
              />
            </DeferredFeature>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel className={styles.categoriesPanel} value="categorization">
          <DeferredFeature
            label="Settings section"
            fallback={
              <LoadingSkeleton label="Loading settings section…">
                <SettingsSkeleton section="categorization" />
              </LoadingSkeleton>
            }
          >
            <CategorizationRulesSection />
          </DeferredFeature>
        </Tabs.Panel>

        <Tabs.Panel className={styles.categoriesPanel} value="recurring">
          <DeferredFeature
            label="Settings section"
            fallback={
              <LoadingSkeleton label="Loading settings section…">
                <SettingsSkeleton section="recurring" filters={false} />
              </LoadingSkeleton>
            }
          >
            <RecurringManualTransactionsSection />
          </DeferredFeature>
        </Tabs.Panel>
      </Tabs>
    </Box>
  )
}
