import { ActionIcon, Grid, Tooltip } from '@mantine/core'
import { Eye, EyeOff } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { lazy, useMemo } from 'react'
import { usePresentationPreferences } from '../../lib/presentation-preferences'
import { useCurrentUser } from '../../lib/session'
import { DeferredOverlay } from '../DeferredOverlay'
import { AccountSection } from '../AccountSection'
import { NetWorthCard } from '../NetWorthCard'
import { PageHeader } from '../PageHeader'
import { DataState } from '../DataState'
import { AccountDetailsSkeleton } from '../loading/LoadingSkeleton'
import { HomeSkeleton } from '../loading/HomeSkeleton'
import { useBalanceData } from '../../hooks/useBalanceData'
import { isZeroBalanceAccount } from '../../lib/balance-utils'

import { isValidTimePeriod } from '../../lib/route-search'
import type { AccountSummaryData } from '../../lib/balance-utils'
import type { HomeSearch } from '../../lib/route-search'
import { TimePeriod } from '@/lib/types'

const AccountModal = lazy(() =>
  import('../AccountModal').then((module) => ({
    default: module.AccountModal,
  })),
)

export function HomePage({ accountId, period = TimePeriod.month }: HomeSearch) {
  const navigate = useNavigate()
  const { data: user } = useCurrentUser()
  const {
    data: dashboard,
    isLoading,
    error,
    refetch,
    isFetching,
    isChangingPeriod,
    chartDisplayData,
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
      navigate({
        to: '/home',
        search: { accountId, period: value },
        resetScroll: false,
      })
    }
  }

  const handleToggleBalancesHidden = () => {
    setBalancesHidden((current) => !current)
  }

  return (
    <>
      <PageHeader
        title="Home"
        mb="md"
        titleAccessory={
          <Tooltip label={balancesHidden ? 'Show balances' : 'Hide balances'}>
            <ActionIcon
              variant="subtle"
              size="md"
              c="dimmed"
              aria-label={balancesHidden ? 'Show balances' : 'Hide balances'}
              aria-pressed={balancesHidden}
              onClick={handleToggleBalancesHidden}
            >
              {balancesHidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </ActionIcon>
          </Tooltip>
        }
      />

      <DataState
        hasData={Boolean(dashboard)}
        isLoading={isLoading}
        isError={Boolean(error)}
        isFetching={isFetching}
        errorMessage="Unable to load the selected dashboard period."
        onRetry={() => void refetch()}
        loadingFallback={<HomeSkeleton />}
      >
        {dashboard && (
          <>
            <NetWorthCard
              period={period}
              onPeriodChange={handlePeriodChange}
              balancesHidden={balancesHidden}
              netWorth={dashboard.netWorth}
              changePercent={dashboard.changePercent}
              changeAmount={dashboard.changeAmount}
              comparisonPeriod={dashboard.comparisonPeriod}
              comparisonLoading={isChangingPeriod}
              chartData={chartDisplayData ?? dashboard.chartData}
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
                  comparisonLoading={isChangingPeriod}
                  isLiability={false}
                  onAccountClick={handleAccountClick}
                />
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 6 }}>
                <AccountSection
                  title="Liabilities"
                  accounts={visibleLiabilities}
                  balancesHidden={balancesHidden}
                  comparisonLoading={isChangingPeriod}
                  isLiability={true}
                  onAccountClick={handleAccountClick}
                />
              </Grid.Col>
            </Grid>
          </>
        )}
      </DataState>

      {selectedAccount && (
        <DeferredOverlay
          label="Account details"
          title={selectedAccount.customName ?? selectedAccount.name}
          size="xl"
          onClose={handleCloseModal}
          centered={false}
          minHeight={0}
          skeleton={<AccountDetailsSkeleton account={selectedAccount} />}
        >
          <AccountModal
            account={selectedAccount}
            opened={!!selectedAccount}
            onClose={handleCloseModal}
            period={period}
            comparisonLoading={isChangingPeriod}
            balancesHidden={balancesHidden}
          />
        </DeferredOverlay>
      )}
    </>
  )
}
