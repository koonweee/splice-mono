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
import { useEffect, useMemo, useState } from 'react'
import {
  getUserControllerMeQueryOptions,
  useUserControllerMe,
  useUserControllerUpdateSettings,
} from '../../api/clients/spliceAPI'
import { CustomCategoriesSection } from '../../components/settings/CustomCategoriesSection'
import { McpConnectionSection } from '../../components/settings/McpConnectionSection'
import { PersonalAccessTokenSection } from '../../components/settings/PersonalAccessTokenSection'
import {
  THEME_PRESETS,
  applyThemePresetId,
  normalizeThemePresetId,
  previewThemePresetId,
} from '../../lib/theme'
import type { ThemePreset, ThemePresetId } from '../../lib/theme'

type SettingsTab = 'general' | 'access' | 'categories' | 'mcp'

export const Route = createFileRoute('/_authed/settings')({
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } => {
    const tab = search.tab
    return tab === 'general' ||
      tab === 'access' ||
      tab === 'categories' ||
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
  return tab === 'access' || tab === 'categories' || tab === 'mcp'
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
      onClick={() => onSelect(preset.id)}
      p="sm"
      style={{
        width: '100%',
        minHeight: 96,
        borderRadius: 'var(--mantine-radius-md)',
        border: selected
          ? '2px solid var(--mantine-primary-color-filled)'
          : '1px solid var(--mantine-color-default-border)',
        background: selected
          ? 'var(--mantine-primary-color-light)'
          : 'var(--mantine-color-body)',
      }}
    >
      <Stack gap={8}>
        <Group justify="space-between" gap="sm" wrap="nowrap">
          <Group gap={4} aria-hidden>
            {preset.swatches.map((swatch) => (
              <ColorSwatch
                key={swatch}
                color={swatch}
                size={18}
                withShadow={false}
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                }}
              />
            ))}
          </Group>
          <Box
            aria-hidden
            style={{
              width: 18,
              height: 18,
              display: 'grid',
              placeItems: 'center',
              color: selected
                ? 'var(--mantine-primary-color-filled)'
                : 'transparent',
            }}
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

export function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: user, isLoading, error } = useUserControllerMe()
  const updateSettingsMutation = useUserControllerUpdateSettings()
  const [selectedTab, setSelectedTab] = useState<SettingsTab>(
    getInitialSettingsTab,
  )

  const timezoneOptions = useMemo(() => getTimezoneOptions(), [])
  const browserTimezone = useMemo(() => getBrowserTimezone(), [])

  const [theme, setTheme] = useState<ThemePresetId>('splice-dark')
  const [currency, setCurrency] = useState<string>('')
  const [timezone, setTimezone] = useState<string>('')
  const [hideZeroBalanceAccounts, setHideZeroBalanceAccounts] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize form values when user data loads
  useEffect(() => {
    if (user?.settings) {
      const nextTheme = normalizeThemePresetId(user.settings.theme)
      setTheme(nextTheme)
      applyThemePresetId(nextTheme)
      setCurrency(user.settings.currency ?? 'USD')
      setTimezone(user.settings.timezone ?? 'UTC')
      setHideZeroBalanceAccounts(user.settings.hideZeroBalanceAccounts ?? false)
    }
  }, [user?.settings])

  // Track if there are unsaved changes
  useEffect(() => {
    if (user?.settings) {
      const themeChanged = theme !== normalizeThemePresetId(user.settings.theme)
      const currencyChanged = currency !== (user.settings.currency ?? 'USD')
      const timezoneChanged = timezone !== (user.settings.timezone ?? 'UTC')
      const hideZeroBalanceAccountsChanged =
        hideZeroBalanceAccounts !==
        (user.settings.hideZeroBalanceAccounts ?? false)
      setHasChanges(
        themeChanged ||
          currencyChanged ||
          timezoneChanged ||
          hideZeroBalanceAccountsChanged,
      )
    }
  }, [theme, currency, timezone, hideZeroBalanceAccounts, user?.settings])

  const handleSave = () => {
    const savedTheme = normalizeThemePresetId(user?.settings.theme)

    updateSettingsMutation.mutate(
      { data: { theme, currency, timezone, hideZeroBalanceAccounts } },
      {
        onSuccess: () => {
          applyThemePresetId(theme)
          // Invalidate user query to refresh the data
          queryClient.invalidateQueries({
            queryKey: getUserControllerMeQueryOptions().queryKey,
          })
          setHasChanges(false)
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
    <>
      <Title order={1} mb="xl">
        Settings
      </Title>

      <Tabs value={selectedTab} onChange={handleTabChange} keepMounted={false}>
        <Tabs.List mb="lg">
          <Tabs.Tab value="general">General</Tabs.Tab>
          <Tabs.Tab value="access">Access</Tabs.Tab>
          <Tabs.Tab value="categories">Categories</Tabs.Tab>
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

        <Tabs.Panel value="access">
          <PersonalAccessTokenSection />
        </Tabs.Panel>

        <Tabs.Panel value="categories">
          <CustomCategoriesSection />
        </Tabs.Panel>

        <Tabs.Panel value="mcp">
          <McpConnectionSection />
        </Tabs.Panel>
      </Tabs>
    </>
  )
}
