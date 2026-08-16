import {
  Alert,
  Box,
  Button,
  ColorSwatch,
  Group,
  Loader,
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
import { createFileRoute } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getUserControllerMeQueryOptions,
  useUserControllerMe,
  useUserControllerUpdateSettings,
} from '../../api/clients/spliceAPI'
import { AnalysisRulesSection } from '../../components/settings/AnalysisRulesSection'
import { CategorizationRulesSection } from '../../components/settings/CategorizationRulesSection'
import { CustomCategoriesSection } from '../../components/settings/CustomCategoriesSection'
import { McpConnectionSection } from '../../components/settings/McpConnectionSection'
import { PageHeader } from '../../components/PageHeader'
import { PersonalAccessTokenSection } from '../../components/settings/PersonalAccessTokenSection'
import { RecurringManualTransactionsSection } from '../../components/settings/RecurringManualTransactionsSection'
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
  updateBankLinkNeedsAttentionPreference,
  updateNewSyncedTransactionsPreference,
} from '../../lib/notifications/browser-push'
import styles from './settings.module.css'
import type { NotificationSupportStatus } from '../../lib/notifications/browser-push'
import type { ThemePreset, ThemePresetId } from '../../lib/theme'

type SettingsTab =
  | 'general'
  | 'notifications'
  | 'access'
  | 'categories'
  | 'analysis'
  | 'categorization'
  | 'recurring'
  | 'mcp'

type GeneralSettingsValues = {
  theme: ThemePresetId
  currency: string
  timezone: string
  hideZeroBalanceAccounts: boolean
}

export const Route = createFileRoute('/_authed/settings')({
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } => {
    const tab = search.tab
    return tab === 'general' ||
      tab === 'notifications' ||
      tab === 'access' ||
      tab === 'categories' ||
      tab === 'analysis' ||
      tab === 'categorization' ||
      tab === 'recurring' ||
      tab === 'mcp'
      ? { tab }
      : {}
  },
  component: SettingsPage,
})

// Common currencies - curated list for better UX
const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'CHF', label: 'CHF - Swiss Franc' },
  { value: 'CNY', label: 'CNY - Chinese Yuan' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'MXN', label: 'MXN - Mexican Peso' },
  { value: 'BRL', label: 'BRL - Brazilian Real' },
  { value: 'KRW', label: 'KRW - South Korean Won' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'HKD', label: 'HKD - Hong Kong Dollar' },
  { value: 'NZD', label: 'NZD - New Zealand Dollar' },
  { value: 'SEK', label: 'SEK - Swedish Krona' },
  { value: 'NOK', label: 'NOK - Norwegian Krone' },
  { value: 'DKK', label: 'DKK - Danish Krone' },
  { value: 'ZAR', label: 'ZAR - South African Rand' },
  { value: 'THB', label: 'THB - Thai Baht' },
]

function getInitialSettingsTab(): SettingsTab {
  if (typeof window === 'undefined') {
    return 'general'
  }

  const tab = new URLSearchParams(window.location.search).get('tab')
  return tab === 'access' ||
    tab === 'notifications' ||
    tab === 'categories' ||
    tab === 'analysis' ||
    tab === 'categorization' ||
    tab === 'recurring' ||
    tab === 'mcp'
    ? tab
    : 'general'
}

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

export function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: user, isLoading, error } = useUserControllerMe()
  const updateSettingsMutation = useUserControllerUpdateSettings()
  const updateAnalysisSankeyMutation = useUserControllerUpdateSettings()
  const [selectedTab, setSelectedTab] = useState<SettingsTab>(
    getInitialSettingsTab,
  )

  const timezoneOptions = useMemo(() => getTimezoneOptions(), [])
  const browserTimezone = useMemo(() => getBrowserTimezone(), [])

  const [theme, setTheme] = useState<ThemePresetId>('splice-dark')
  const [currency, setCurrency] = useState<string>('')
  const [timezone, setTimezone] = useState<string>('')
  const [hideZeroBalanceAccounts, setHideZeroBalanceAccounts] = useState(false)
  const [analysisSankeyEnabled, setAnalysisSankeyEnabled] = useState(false)
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
    useState(false)
  const [newSyncedTransactionsPending, setNewSyncedTransactionsPending] =
    useState(false)
  const [bankLinkNeedsAttentionEnabled, setBankLinkNeedsAttentionEnabled] =
    useState(false)
  const [bankLinkNeedsAttentionPending, setBankLinkNeedsAttentionPending] =
    useState(false)
  const [settingsBaseline, setSettingsBaseline] =
    useState<GeneralSettingsValues | null>(null)
  const settingsBaselineRef = useRef<GeneralSettingsValues | null>(null)
  const latestServerGeneralSettingsRef =
    useRef<GeneralSettingsValues | null>(null)
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

      setAnalysisSankeyEnabled(user.settings.analysisSankeyEnabled ?? false)
      setNewSyncedTransactionsEnabled(
        getNewSyncedTransactionsEnabled(
          user.settings as UserSettingsWithNotifications,
        ),
      )
      setBankLinkNeedsAttentionEnabled(
        getBankLinkNeedsAttentionEnabled(
          user.settings as UserSettingsWithNotifications,
        ),
      )
    }
  }, [user?.settings])

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
          queryClient.invalidateQueries({
            queryKey: getUserControllerMeQueryOptions().queryKey,
          })
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
    await updateSettingsMutation.mutateAsync({
      data: { neutralizationLookaroundDays: days },
    })
    await queryClient.invalidateQueries({
      queryKey: getUserControllerMeQueryOptions().queryKey,
    })
  }

  const handleAnalysisSankeyChange = async (checked: boolean) => {
    const previousValue = analysisSankeyEnabled
    setAnalysisSankeyEnabled(checked)
    setAnalysisSankeyError(null)

    try {
      await updateAnalysisSankeyMutation.mutateAsync({
        data: { analysisSankeyEnabled: checked },
      })
      await queryClient.invalidateQueries({
        queryKey: getUserControllerMeQueryOptions().queryKey,
      })
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
      await updateNewSyncedTransactionsPreference(checked)
      await queryClient.invalidateQueries({
        queryKey: getUserControllerMeQueryOptions().queryKey,
      })
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
      await updateBankLinkNeedsAttentionPreference(checked)
      await queryClient.invalidateQueries({
        queryKey: getUserControllerMeQueryOptions().queryKey,
      })
    } catch {
      setBankLinkNeedsAttentionEnabled(previousValue)
      setNotificationError('Failed to save notification preference')
    } finally {
      setBankLinkNeedsAttentionPending(false)
    }
  }

  const handleTabChange = (value: string | null) => {
    const nextTab = (value ?? 'general') as SettingsTab
    setSelectedTab(nextTab)

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (nextTab === 'general') {
        url.searchParams.delete('tab')
      } else {
        url.searchParams.set('tab', nextTab)
      }
      window.history.replaceState(null, '', url)
    }
  }

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (error) {
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
        <Tabs.List className={styles.settingsTabList} mb="lg">
          <Tabs.Tab value="general">General</Tabs.Tab>
          <Tabs.Tab value="notifications">Notifications</Tabs.Tab>
          <Tabs.Tab value="access">Access</Tabs.Tab>
          <Tabs.Tab value="categories">Categories</Tabs.Tab>
          <Tabs.Tab value="analysis">Analysis</Tabs.Tab>
          <Tabs.Tab value="categorization">Categorization</Tabs.Tab>
          <Tabs.Tab value="recurring">Recurring</Tabs.Tab>
          <Tabs.Tab value="mcp">MCP</Tabs.Tab>
        </Tabs.List>

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
                  Display Currency
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
                    Use Browser
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
                  Home Dashboard
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
                  Save Changes
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
                {getNotificationSupportMessage(notificationSupportStatus) && (
                  <Alert color="yellow" title="Unavailable">
                    {getNotificationSupportMessage(notificationSupportStatus)}
                  </Alert>
                )}
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
          <PersonalAccessTokenSection />
        </Tabs.Panel>

        <Tabs.Panel className={styles.categoriesPanel} value="categories">
          <CustomCategoriesSection />
        </Tabs.Panel>

        <Tabs.Panel className={styles.categoriesPanel} value="analysis">
          <Stack gap="lg">
            <Paper withBorder p="lg" radius="md">
              <Stack gap="sm">
                <Title order={4}>Analysis Display</Title>
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
            <AnalysisRulesSection
              lookaroundSetting={{
                value: user?.settings.neutralizationLookaroundDays ?? 60,
                isSaving: updateSettingsMutation.isPending,
                onSave: handleSaveNeutralizationLookaround,
              }}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel className={styles.categoriesPanel} value="categorization">
          <CategorizationRulesSection />
        </Tabs.Panel>

        <Tabs.Panel className={styles.categoriesPanel} value="recurring">
          <RecurringManualTransactionsSection />
        </Tabs.Panel>

        <Tabs.Panel value="mcp">
          <McpConnectionSection />
        </Tabs.Panel>
      </Tabs>
    </Box>
  )
}
