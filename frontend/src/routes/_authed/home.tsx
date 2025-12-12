import { TIME_PERIOD_LABELS, TimePeriod } from '@/lib/types'
import { Alert, Grid, Group, Loader, Select, Title } from '@mantine/core'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { AccountModal } from '../../components/AccountModal'
import { AccountSection } from '../../components/AccountSection'
import { NetWorthCard } from '../../components/NetWorthCard'
import { useBalanceData } from '../../hooks/useBalanceData'
import type { AccountSummaryData } from '../../lib/balance-utils'

type HomeSearch = {
  accountId?: string
}

export const Route = createFileRoute('/_authed/home')({
  component: HomePage,
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    accountId:
      typeof search.accountId === 'string' ? search.accountId : undefined,
  }),
})

const PERIOD_OPTIONS = [
  { value: TimePeriod.day, label: TIME_PERIOD_LABELS[TimePeriod.day] },
  { value: TimePeriod.week, label: TIME_PERIOD_LABELS[TimePeriod.week] },
  { value: TimePeriod.month, label: TIME_PERIOD_LABELS[TimePeriod.month] },
  { value: TimePeriod.year, label: TIME_PERIOD_LABELS[TimePeriod.year] },
]

function HomePage() {
  const { accountId } = Route.useSearch()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<TimePeriod>(TimePeriod.month)
  const { data: dashboard, isLoading, error } = useBalanceData(period)

  // Find the selected account from the dashboard data
  const selectedAccount: AccountSummaryData | undefined =
    accountId && dashboard
      ? ([...dashboard.assets, ...dashboard.liabilities].find(
          (a) => a.id === accountId,
        ) ?? undefined)
      : undefined

  const handleAccountClick = (account: AccountSummaryData) => {
    navigate({ to: '/home', search: { accountId: account.id } })
  }

  const handleCloseModal = () => {
    navigate({ to: '/home', search: {} })
  }

  return (
    <>
      <Group justify="space-between" mb="xl">
        <Title order={1}>Home</Title>
        <Select
          value={period}
          onChange={(value) => value && setPeriod(value as TimePeriod)}
          data={PERIOD_OPTIONS}
          w={120}
          size="md"
        />
      </Group>

      {isLoading && (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      )}

      {error && (
        <Alert color="red" title="Error" mb="lg">
          Error loading dashboard. Please try again.
        </Alert>
      )}

      {dashboard && (
        <>
          <NetWorthCard
            netWorth={dashboard.netWorth}
            changePercent={dashboard.changePercent}
            comparisonPeriod={dashboard.comparisonPeriod}
            chartData={dashboard.chartData}
          />

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <AccountSection
                title="Assets"
                accounts={dashboard.assets}
                isLiability={false}
                onAccountClick={handleAccountClick}
              />
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <AccountSection
                title="Liabilities"
                accounts={dashboard.liabilities}
                isLiability={true}
                onAccountClick={handleAccountClick}
              />
            </Grid.Col>
          </Grid>
        </>
      )}

      <AccountModal
        account={selectedAccount}
        opened={!!accountId}
        onClose={handleCloseModal}
      />
    </>
  )
}
