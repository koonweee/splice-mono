import { Alert, Button, Grid, Group, Loader, Select } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { lazy, useMemo } from 'react'
import { usePresentationPreferences } from '../../lib/presentation-preferences'
import { useCurrentUser } from '../../lib/session'
import { DeferredFeature } from '../DeferredFeature'
import { AccountSection } from '../AccountSection'
import { NetWorthCard } from '../NetWorthCard'
import { PageHeader } from '../PageHeader'
import { useBalanceData } from '../../hooks/useBalanceData'
import { isZeroBalanceAccount } from '../../lib/balance-utils'

import { isValidTimePeriod } from '../../lib/route-search'
import type { AccountSummaryData } from '../../lib/balance-utils'
import type { HomeSearch } from '../../lib/route-search'
import { TIME_PERIOD_LABELS, TimePeriod } from '@/lib/types'

const AccountModal = lazy(() =>
  import('../AccountModal').then((module) => ({
    default: module.AccountModal,
  })),
)

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

export function HomePage({ accountId, period = TimePeriod.month }: HomeSearch) {
  const navigate = useNavigate()
  const { data: user } = useCurrentUser()
  const {
    data: dashboard,
    isLoading,
    error,
    refetch,
    isFetching,
    seriesError,
    seriesLoading,
    refetchSeries,
  } = useBalanceData(
    period,
    user ? (user.settings.currency ?? 'USD') : undefined,
  )
  const { maskBalances: balancesHidden, setMaskBalances: setBalancesHidden } =
    usePresentationPreferences()
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
    void import('../AccountModal')
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

      {error && (
        <Alert color="red" title="Error" mb="lg">
          Error loading dashboard.{' '}
          {dashboard && 'Previously loaded results are shown below.'}
          <Button
            variant="light"
            color="red"
            loading={isFetching}
            onClick={() => void refetch()}
          >
            Retry dashboard
          </Button>
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
            chartLoading={seriesLoading}
            chartError={Boolean(seriesError)}
            onRetryChart={() => void refetchSeries()}
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

      {selectedAccount && (
        <DeferredFeature label="Account details">
          <AccountModal
            account={selectedAccount}
            opened={!!selectedAccount}
            onClose={handleCloseModal}
            period={period}
            balancesHidden={balancesHidden}
          />
        </DeferredFeature>
      )}
    </>
  )
}
