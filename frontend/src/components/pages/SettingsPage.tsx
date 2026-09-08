import {
  Alert,
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
import { useQueryClient } from '@tanstack/react-query'
import { lazy, useEffect, useMemo, useRef, useState } from 'react'
import { loadSettingsSection } from '../../lib/queries/settings'
import {
  prepareSettingsCode,
  settingsFeatureLoaders,
} from '../../lib/feature-loaders'
import { LoadingSkeleton } from '../loading/LoadingSkeleton'
import { AccessTokensSkeleton } from '../settings/PersonalAccessTokenSection.skeleton'
import { SettingsSectionSkeleton } from '../settings/SettingsSection.skeleton'
import { useSettingsMutation } from '../../hooks/useSettingsMutation'
import { useCurrentUser } from '../../lib/session'
import { invalidateMutationFamilies } from '../../lib/query-invalidation'
import { DeferredFeature } from '../DeferredFeature'
import { getUserControllerMeQueryOptions } from '../../api/clients/spliceAPI'
import { PageLayout } from '../PageLayout'
import {
  appearanceEqual,
  applyAppearance,
  normalizeAppearance,
  previewAppearance,
} from '../../lib/appearance-preferences'
import { DEFAULT_APPEARANCE } from '../../lib/design-system/appearance'
import { AppearanceControl } from '../settings/AppearanceControl'
import {
  disableCurrentDeviceNotifications,
  enableCurrentDeviceNotifications,
  loadCurrentDeviceNotificationState,
} from '../../lib/notifications/browser-push'
import { useAppTransitionGuard } from '../../lib/pwa/app-transition'
import {
  GeneralSettingsFrame,
  NotificationSettingsFrame,
  SettingsPageFrame,
} from './SettingsPageFrame'
import styles from './SettingsPage.module.css'
import type { NotificationSupportStatus } from '../../lib/notifications/browser-push'
import type { AppearancePreference } from '../../lib/design-system/appearance'

import type { SettingsTab } from '../../lib/route-search'

const AnalysisRulesSection = lazy(settingsFeatureLoaders.analysis)
const CategorizationRulesSection = lazy(settingsFeatureLoaders.categorization)
const CustomCategoriesSection = lazy(settingsFeatureLoaders.categories)
const PersonalAccessTokenSection = lazy(settingsFeatureLoaders.access)
const RecurringManualTransactionsSection = lazy(
  settingsFeatureLoaders.recurring,
)

type GeneralSettingsValues = {
  appearance: AppearancePreference
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
    case 'install-required':
      return 'Add Splice to your Home Screen, then open it there to enable notifications.'
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

  const [appearance, setAppearance] = useState<AppearancePreference>(() =>
    normalizeAppearance(user?.settings.appearance),
  )
  const [appearanceReset, setAppearanceReset] = useState(0)
  const [appearanceValid, setAppearanceValid] = useState(true)
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
  const [notificationRetry, setNotificationRetry] = useState(0)
  const [deviceRebindRequired, setDeviceRebindRequired] = useState(false)
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
      user ? { appearance, currency, timezone, hideZeroBalanceAccounts } : null,
    )
  const settingsBaselineRef = useRef<GeneralSettingsValues | null>(
    settingsBaseline,
  )
  const latestServerGeneralSettingsRef = useRef<GeneralSettingsValues | null>(
    settingsBaseline,
  )
  const generalDraftRef = useRef<GeneralSettingsValues>({
    appearance,
    currency,
    timezone,
    hideZeroBalanceAccounts,
  })
  generalDraftRef.current = {
    appearance,
    currency,
    timezone,
    hideZeroBalanceAccounts,
  }
  const hasChanges =
    settingsBaseline !== null &&
    (!appearanceEqual(appearance, settingsBaseline.appearance) ||
      currency !== settingsBaseline.currency ||
      timezone !== settingsBaseline.timezone ||
      hideZeroBalanceAccounts !== settingsBaseline.hideZeroBalanceAccounts)
  useAppTransitionGuard(hasChanges)

  // Adopt server values only while the General form is clean. Unrelated
  // immediate-save refetches must not replace an in-progress draft.
  useEffect(() => {
    if (user?.settings) {
      const nextGeneralSettings: GeneralSettingsValues = {
        appearance: normalizeAppearance(user.settings.appearance),
        currency: user.settings.currency ?? 'USD',
        timezone: user.settings.timezone ?? 'UTC',
        hideZeroBalanceAccounts: user.settings.hideZeroBalanceAccounts ?? false,
      }
      latestServerGeneralSettingsRef.current = nextGeneralSettings
      const currentBaseline = settingsBaselineRef.current
      const currentDraft = generalDraftRef.current
      const draftIsDirty =
        currentBaseline !== null &&
        (!appearanceEqual(
          currentDraft.appearance,
          currentBaseline.appearance,
        ) ||
          currentDraft.currency !== currentBaseline.currency ||
          currentDraft.timezone !== currentBaseline.timezone ||
          currentDraft.hideZeroBalanceAccounts !==
            currentBaseline.hideZeroBalanceAccounts)

      if (!draftIsDirty) {
        settingsBaselineRef.current = nextGeneralSettings
        setSettingsBaseline(nextGeneralSettings)
        setAppearance(nextGeneralSettings.appearance)
        applyAppearance(nextGeneralSettings.appearance)
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
      (appearanceEqual(
        currentDraft.appearance,
        latestServerSettings.appearance,
      ) &&
        currentDraft.currency === latestServerSettings.currency &&
        currentDraft.timezone === latestServerSettings.timezone &&
        currentDraft.hideZeroBalanceAccounts ===
          latestServerSettings.hideZeroBalanceAccounts)
    ) {
      return
    }

    settingsBaselineRef.current = latestServerSettings
    setSettingsBaseline(latestServerSettings)
    setAppearance(latestServerSettings.appearance)
    applyAppearance(latestServerSettings.appearance)
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
          setDeviceRebindRequired(Boolean(state.rebindRequired))
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
    const refresh = () => setNotificationRetry((value) => value + 1)
    window.addEventListener('splice:notification-state-changed', refresh)

    return () => {
      cancelled = true
      window.removeEventListener('splice:notification-state-changed', refresh)
    }
  }, [notificationRetry])

  useEffect(
    () => () => {
      previewAppearance(
        latestServerGeneralSettingsRef.current?.appearance ??
          DEFAULT_APPEARANCE,
      )
    },
    [],
  )

  const handleCancel = () => {
    const saved = latestServerGeneralSettingsRef.current
    if (!saved) return
    setAppearance(saved.appearance)
    setAppearanceReset((current) => current + 1)
    setCurrency(saved.currency)
    setTimezone(saved.timezone)
    setHideZeroBalanceAccounts(saved.hideZeroBalanceAccounts)
    settingsBaselineRef.current = saved
    setSettingsBaseline(saved)
    previewAppearance(saved.appearance)
  }

  const handleSave = () => {
    const savedAppearance = settingsBaseline?.appearance ?? DEFAULT_APPEARANCE
    const submittedSettings = {
      appearance,
      currency,
      timezone,
      hideZeroBalanceAccounts,
    }

    updateSettingsMutation.mutate(
      { data: submittedSettings },
      {
        onSuccess: () => {
          applyAppearance(appearance)
          latestServerGeneralSettingsRef.current = submittedSettings
          settingsBaselineRef.current = submittedSettings
          setSettingsBaseline(submittedSettings)
          // Invalidate user query to refresh the data
          invalidateMutationFamilies(queryClient, ['user'])
        },
        onError: () => {
          previewAppearance(savedAppearance)
        },
      },
    )
  }

  const handleSetBrowserTimezone = () => {
    setTimezone(browserTimezone)
  }

  const handleAppearanceSelect = (nextAppearance: AppearancePreference) => {
    setAppearance(nextAppearance)
    previewAppearance(nextAppearance)
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

  const handleTabChange = (value: string | null) => {
    const nextTab = (value ?? 'general') as SettingsTab
    prepareTab(nextTab)
    setSelectedTab(nextTab)

    onTabChange?.(nextTab)
  }

  if (error && !user) {
    return (
      <PageLayout title="Settings">
        <Alert color="red" title="Error">
          Failed to load settings
        </Alert>
      </PageLayout>
    )
  }

  return (
    <SettingsPageFrame
      tab={selectedTab}
      onChange={handleTabChange}
      onPrepare={prepareTab}
      tabListRef={tabListRef}
    >
      <Tabs.Panel value="general">
        <GeneralSettingsFrame
          appearance={
            <>
              <AppearanceControl
                withHeading
                resetVersion={appearanceReset}
                value={appearance}
                onChange={handleAppearanceSelect}
                disabled={isLoading || updateSettingsMutation.isPending}
                onValidityChange={setAppearanceValid}
              />
            </>
          }
          currency={
            <>
              <Title data-typography="sectionHeading" order={4} mb="xs">
                Display currency
              </Title>
              <Select
                value={isLoading ? null : currency}
                disabled={isLoading}
                onChange={(value) => value && setCurrency(value)}
                data={CURRENCY_OPTIONS}
                searchable
                size="md"
                placeholder="Select currency"
                aria-label="Display currency"
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
                <Button
                  variant="light"
                  size="sm"
                  onClick={handleSetBrowserTimezone}
                  disabled={isLoading || timezone === browserTimezone}
                >
                  Use browser
                </Button>
              </Group>
              <Select
                value={isLoading ? null : timezone}
                disabled={isLoading}
                onChange={(value) => value && setTimezone(value)}
                data={timezoneOptions}
                searchable
                size="md"
                placeholder="Select timezone"
                aria-label="Timezone"
              />
              <Text data-typography="metadata" c="dimmed" mt={4}>
                Dates and times use this timezone.
              </Text>
              {browserTimezone && browserTimezone !== timezone && (
                <Text data-typography="caption" c="dimmed" mt="xs">
                  Detected: {browserTimezone}
                </Text>
              )}
            </>
          }
          preferences={
            <>
              <Switch
                label="Hide zero balances on Home"
                disabled={isLoading || updateSettingsMutation.isPending}
                checked={hideZeroBalanceAccounts}
                onChange={(event) =>
                  setHideZeroBalanceAccounts(event.currentTarget.checked)
                }
              />

              <Switch
                label="Use monospace font for amounts"
                checked={appearance.monospaceAmounts ?? false}
                disabled={isLoading || updateSettingsMutation.isPending}
                onChange={(event) =>
                  handleAppearanceSelect({
                    ...appearance,
                    monospaceAmounts: event.currentTarget.checked,
                  })
                }
              />
            </>
          }
          actions={
            <>
              <Group justify="flex-end">
                <Button
                  variant="default"
                  onClick={handleCancel}
                  disabled={
                    isLoading ||
                    (!hasChanges && appearanceValid) ||
                    updateSettingsMutation.isPending
                  }
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  loading={updateSettingsMutation.isPending}
                  disabled={isLoading || !hasChanges || !appearanceValid}
                >
                  Save changes
                </Button>
              </Group>
            </>
          }
        >
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
        </GeneralSettingsFrame>
      </Tabs.Panel>

      <Tabs.Panel value="notifications">
        <NotificationSettingsFrame
          device={
            <>
              <Title data-typography="sectionHeading" order={4}>
                Notifications
              </Title>
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
              <Text
                data-typography="metadata"
                c="dimmed"
                mih={42}
                aria-live="polite"
              >
                {deviceNotificationsLoading
                  ? 'Checking device notification status…'
                  : deviceNotificationsPending
                    ? 'Updating device notifications…'
                    : deviceRebindRequired
                      ? 'This device needs to reconnect notifications after the app update.'
                      : (getNotificationSupportMessage(
                          notificationSupportStatus,
                        ) ??
                        'Device notifications are configured separately in each browser.')}
              </Text>
              {deviceRebindRequired && !deviceNotificationsLoading && (
                <Button
                  variant="light"
                  onClick={() => void handleDeviceNotificationsChange(true)}
                  loading={deviceNotificationsPending}
                >
                  Reconnect notifications
                </Button>
              )}
            </>
          }
          transactions={
            <>
              <Title data-typography="sectionHeading" order={4}>
                Transactions
              </Title>
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
            </>
          }
        >
          {notificationError && (
            <Alert color="red" title="Error">
              {notificationError}
              <Button
                size="xs"
                variant="light"
                ml="sm"
                onClick={() => setNotificationRetry((value) => value + 1)}
                disabled={
                  deviceNotificationsLoading || deviceNotificationsPending
                }
              >
                Retry
              </Button>
            </Alert>
          )}
        </NotificationSettingsFrame>
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
              <SettingsSectionSkeleton section="categories" />
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
              <Title data-typography="sectionHeading" order={4}>
                Analysis display
              </Title>
              <Switch
                label="Use Sankey diagram on Analysis"
                description="Replace separate inflow and outflow charts with one cashflow diagram."
                checked={analysisSankeyEnabled}
                disabled={isLoading || updateAnalysisSankeyMutation.isPending}
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
                <SettingsSectionSkeleton section="analysis" />
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
              <SettingsSectionSkeleton section="categorization" />
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
              <SettingsSectionSkeleton section="recurring" />
            </LoadingSkeleton>
          }
        >
          <RecurringManualTransactionsSection />
        </DeferredFeature>
      </Tabs.Panel>
    </SettingsPageFrame>
  )
}
