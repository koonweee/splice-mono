import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  getUserControllerMeQueryOptions,
  useUserControllerMe,
  useUserControllerUpdateSettings,
} from '../../api/clients/spliceAPI'

export const Route = createFileRoute('/_authed/settings')({
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

function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: user, isLoading, error } = useUserControllerMe()
  const updateSettingsMutation = useUserControllerUpdateSettings()

  const timezoneOptions = useMemo(() => getTimezoneOptions(), [])
  const browserTimezone = useMemo(() => getBrowserTimezone(), [])

  const [currency, setCurrency] = useState<string>('')
  const [timezone, setTimezone] = useState<string>('')
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize form values when user data loads
  useEffect(() => {
    if (user?.settings) {
      setCurrency(user.settings.currency ?? 'USD')
      setTimezone(user.settings.timezone ?? 'UTC')
    }
  }, [user?.settings])

  // Track if there are unsaved changes
  useEffect(() => {
    if (user?.settings) {
      const currencyChanged = currency !== (user.settings.currency ?? 'USD')
      const timezoneChanged = timezone !== (user.settings.timezone ?? 'UTC')
      setHasChanges(currencyChanged || timezoneChanged)
    }
  }, [currency, timezone, user?.settings])

  const handleSave = () => {
    updateSettingsMutation.mutate(
      { data: { currency, timezone } },
      {
        onSuccess: () => {
          // Invalidate user query to refresh the data
          queryClient.invalidateQueries({
            queryKey: getUserControllerMeQueryOptions().queryKey,
          })
          setHasChanges(false)
        },
      },
    )
  }

  const handleSetBrowserTimezone = () => {
    setTimezone(browserTimezone)
  }

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    )
  }

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

      <Paper withBorder p="lg" radius="md" maw={500}>
        <Stack gap="lg">
          <div>
            <Title order={4} mb="xs">
              Display Currency
            </Title>
            <Text size="sm" c="dimmed" mb="sm">
              All balances and amounts will be converted to this currency for
              display.
            </Text>
            <Select
              value={currency}
              onChange={(value) => value && setCurrency(value)}
              data={CURRENCY_OPTIONS}
              searchable
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
    </>
  )
}
