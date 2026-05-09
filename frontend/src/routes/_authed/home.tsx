import { Alert, Grid, Group, Loader, Select } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useUserControllerMe } from '../../api/clients/spliceAPI'
import { AccountModal } from '../../components/AccountModal'
import { AccountSection } from '../../components/AccountSection'
import { NetWorthCard } from '../../components/NetWorthCard'
import { PageHeader } from '../../components/PageHeader'
import { useBalanceData } from '../../hooks/useBalanceData'
import { isZeroBalanceAccount } from '../../lib/balance-utils'
import type { AccountSummaryData } from '../../lib/balance-utils'
import { TIME_PERIOD_LABELS, TimePeriod } from '@/lib/types'

type HomeSearch = {
  accountId?: string
  period?: TimePeriod
}

const isValidTimePeriod = (value: unknown): value is TimePeriod =>
  typeof value === 'string' &&
  Object.values(TimePeriod).includes(value as TimePeriod)

export const Route = createFileRoute('/_authed/home')({
  component: HomePage,
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    accountId:
      typeof search.accountId === 'string' ? search.accountId : undefined,
    period: isValidTimePeriod(search.period) ? search.period : undefined,
  }),
})

const PERIOD_OPTIONS = [
  { value: TimePeriod.day, label: TIME_PERIOD_LABELS[TimePeriod.day] },
  { value: TimePeriod.week, label: TIME_PERIOD_LABELS[TimePeriod.week] },
  { value: TimePeriod.month, label: TIME_PERIOD_LABELS[TimePeriod.month] },
  { value: TimePeriod.year, label: TIME_PERIOD_LABELS[TimePeriod.year] },
  {
    value: TimePeriod.threeYears,
    label: TIME_PERIOD_LABELS[TimePeriod.threeYears],
  },
  {
    value: TimePeriod.fiveYears,
    label: TIME_PERIOD_LABELS[TimePeriod.fiveYears],
  },
  {
    value: TimePeriod.tenYears,
    label: TIME_PERIOD_LABELS[TimePeriod.tenYears],
  },
]

export const HOME_BALANCES_HIDDEN_STORAGE_KEY = 'splice:home-balances-hidden'

export function HomePage() {
  const { accountId, period = TimePeriod.month } = Route.useSearch()
  const navigate = useNavigate()
  const { data: dashboard, isLoading, error } = useBalanceData(period)
  const { data: user } = useUserControllerMe()
  const [balancesHidden, setBalancesHidden] = useLocalStorage<boolean>({
    key: HOME_BALANCES_HIDDEN_STORAGE_KEY,
    defaultValue: false,
    getInitialValueInEffect: false,
  })
  const hideZeroBalanceAccounts =
    user?.settings.hideZeroBalanceAccounts ?? false

  const visibleAssets = useMemo(
    () =>
      dashboard?.assets.filter((account) => {
        if (account.archivedAt) return false
        return !hideZeroBalanceAccounts || !isZeroBalanceAccount(account)
      }) ?? [],
    [dashboard?.assets, hideZeroBalanceAccounts],
  )

  const visibleLiabilities = useMemo(
    () =>
      dashboard?.liabilities.filter((account) => {
        if (account.archivedAt) return false
        return !hideZeroBalanceAccounts || !isZeroBalanceAccount(account)
      }) ?? [],
    [dashboard?.liabilities, hideZeroBalanceAccounts],
  )

  // Find the selected account from the dashboard data
  const selectedAccount: AccountSummaryData | undefined =
    accountId && dashboard
      ? ([...visibleAssets, ...visibleLiabilities].find(
          (a) => a.id === accountId,
        ) ?? undefined)
      : undefined

  const handleAccountClick = (account: AccountSummaryData) => {
    navigate({
      to: '/home',
      search: { accountId: account.id, period },
      resetScroll: false,
    })
  }

  const handleCloseModal = () => {
    navigate({ to: '/home', search: { period }, resetScroll: false })
  }

  const handlePeriodChange = (value: string | null) => {
    if (value && isValidTimePeriod(value)) {
      navigate({ to: '/home', search: { accountId, period: value } })
    }
  }

  const handleToggleBalancesHidden = () => {
    setBalancesHidden((current) => !current)
  }

  return (
    <>
      <PageHeader
        title="Home"
        actions={
          <Select
            value={period}
            onChange={handlePeriodChange}
            data={PERIOD_OPTIONS}
            w={120}
            size="md"
          />
        }
      />

      {isLoading && (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      )}

      {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */}
      {error && (
        <Alert color="red" title="Error" mb="lg">
          Error loading dashboard. Please try again.
        </Alert>
      )}

      {dashboard && (
        <>
          <NetWorthCard
            balancesHidden={balancesHidden}
            netWorth={dashboard.netWorth}
            onToggleBalancesHidden={handleToggleBalancesHidden}
            changePercent={dashboard.changePercent}
            changeAmount={dashboard.changeAmount}
            comparisonPeriod={dashboard.comparisonPeriod}
            chartData={dashboard.chartData}
          />

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <AccountSection
                title="Assets"
                accounts={visibleAssets}
                balancesHidden={balancesHidden}
                isLiability={false}
                onAccountClick={handleAccountClick}
              />
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <AccountSection
                title="Liabilities"
                accounts={visibleLiabilities}
                balancesHidden={balancesHidden}
                isLiability={true}
                onAccountClick={handleAccountClick}
              />
            </Grid.Col>
          </Grid>
        </>
      )}

      <AccountModal
        account={selectedAccount}
        opened={!!selectedAccount}
        onClose={handleCloseModal}
        period={period}
      />
    </>
  )
}
