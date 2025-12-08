import {
  Alert,
  Button,
  Container,
  Grid,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useDashboardControllerGetSummary } from '../api/clients/spliceAPI'
import type { AccountSummary } from '../api/models'
import { TimePeriod } from '../api/models'
import { useLogout } from '../lib/auth'
import { formatMoneyWithSign, formatPercent } from '../lib/format'

export const Route = createFileRoute('/home')({ component: HomePage })

const PERIOD_OPTIONS = [
  { value: TimePeriod.day, label: 'Day' },
  { value: TimePeriod.week, label: 'Week' },
  { value: TimePeriod.month, label: 'Month' },
  { value: TimePeriod.year, label: 'Year' },
]

const PERIOD_LABELS: Record<TimePeriod, string> = {
  [TimePeriod.day]: 'Day',
  [TimePeriod.week]: 'Week',
  [TimePeriod.month]: 'Month',
  [TimePeriod.year]: 'Year',
}

function getChangeColorMantine(
  changePercent: number | null,
  isLiability: boolean,
): string {
  if (changePercent === null) return 'dimmed'
  const isPositive = changePercent > 0
  const isGood = isLiability ? !isPositive : isPositive
  return isGood ? 'teal' : 'red'
}

function AccountCard({
  account,
  isLiability,
}: {
  account: AccountSummary
  isLiability: boolean
}) {
  const changePercent = formatPercent(account.changePercent)

  return (
    <Paper p="md" withBorder>
      <Group justify="space-between" align="flex-start">
        <div>
          <Text fw={500}>{account.name || 'Unnamed Account'}</Text>
          <Text size="sm" c="dimmed" tt="capitalize">
            {account.subType || account.type}
          </Text>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Text fw={600}>{formatMoneyWithSign(account.currentBalance)}</Text>
          {changePercent && (
            <Text
              size="sm"
              c={getChangeColorMantine(account.changePercent, isLiability)}
            >
              {changePercent}
            </Text>
          )}
        </div>
      </Group>
    </Paper>
  )
}

function HomePage() {
  const [period, setPeriod] = useState<TimePeriod>(TimePeriod.month)
  const logoutMutation = useLogout()
  const {
    data: dashboard,
    isLoading,
    error,
  } = useDashboardControllerGetSummary({ period })

  const handleLogout = () => {
    // Refresh token is sent via HTTP-only cookie
    logoutMutation.mutate({ data: {} })
  }

  return (
    <Container size="md" py="xl">
      <Group justify="space-between" mb="xl">
        <Title order={1}>Dashboard</Title>
        <Group>
          <Select
            value={period}
            onChange={(value) => value && setPeriod(value as TimePeriod)}
            data={PERIOD_OPTIONS}
            w={120}
          />
          <Button
            onClick={handleLogout}
            loading={logoutMutation.isPending}
            variant="filled"
            color="dark"
          >
            Logout
          </Button>
        </Group>
      </Group>

      {isLoading && (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      )}

      {error ? (
        <Alert color="red" title="Error" mb="lg">
          Error loading dashboard:{' '}
          {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      ) : null}

      {dashboard && (
        <>
          <Paper p="lg" withBorder mb="xl">
            <Text size="sm" c="dimmed" mb={4}>
              Net Worth
            </Text>
            <Title order={2} size="h1">
              {formatMoneyWithSign(dashboard.netWorth)}
            </Title>
            {dashboard.changePercent !== null && (
              <Text
                size="sm"
                c={getChangeColorMantine(dashboard.changePercent, false)}
              >
                {formatPercent(dashboard.changePercent)} from last{' '}
                {PERIOD_LABELS[dashboard.comparisonPeriod].toLowerCase()}
              </Text>
            )}
          </Paper>

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Title order={3} mb="md">
                Assets
              </Title>
              <Stack gap="sm">
                {dashboard.assets.length === 0 ? (
                  <Text c="dimmed">No assets</Text>
                ) : (
                  dashboard.assets.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      isLiability={false}
                    />
                  ))
                )}
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Title order={3} mb="md">
                Liabilities
              </Title>
              <Stack gap="sm">
                {dashboard.liabilities.length === 0 ? (
                  <Text c="dimmed">No liabilities</Text>
                ) : (
                  dashboard.liabilities.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      isLiability={true}
                    />
                  ))
                )}
              </Stack>
            </Grid.Col>
          </Grid>
        </>
      )}
    </Container>
  )
}
