import { useNavigate } from '@tanstack/react-router'
import { lazy, useMemo } from 'react'
import { usePresentationPreferences } from '../../lib/presentation-preferences'
import { useCurrentUser } from '../../lib/session'
import { DeferredOverlay } from '../DeferredOverlay'
import { useSaveHomeSnapshot } from '../../lib/pwa/use-save-home-snapshot'
import { DataState } from '../DataState'
import { AccountDetailsSkeleton } from '../AccountModal.skeleton'
import { useBalanceData } from '../../hooks/useBalanceData'
import { isZeroBalanceAccount } from '../../lib/balance-utils'

import { isValidTimePeriod } from '../../lib/route-search'
import { HomeContent } from './HomeContent'
import { HomeSkeleton } from './HomePage.skeleton'
import { HomePageFrame } from './HomePageFrame'
import type { AccountSummaryData } from '../../lib/balance-utils'
import type { HomeSearch } from '../../lib/route-search'
import { TimePeriod } from '@/lib/types'

const AccountModal = lazy(() =>
  import('../AccountModal').then((module) => ({
    default: module.AccountModal,
  })),
)

export function HomePage({ accountId, period = TimePeriod.month }: HomeSearch) {
  useSaveHomeSnapshot(period)
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
  const { maskBalances: balancesHidden } = usePresentationPreferences()
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

  return (
    <HomePageFrame>
      <DataState
        backgroundErrorMode={isChangingPeriod ? 'local' : 'header'}
        hasData={Boolean(dashboard)}
        isLoading={isLoading}
        isError={Boolean(error)}
        isFetching={isFetching}
        errorMessage="Unable to load the selected dashboard period."
        onRetry={() => void refetch()}
        loadingFallback={<HomeSkeleton period={period} />}
      >
        {dashboard && (
          <HomeContent
            dashboard={dashboard}
            period={period}
            balancesHidden={balancesHidden}
            visibleAssets={visibleAssets}
            visibleLiabilities={visibleLiabilities}
            isChangingPeriod={isChangingPeriod}
            chartDisplayData={chartDisplayData}
            seriesLoading={seriesLoading}
            seriesError={Boolean(seriesError)}
            onPeriodChange={handlePeriodChange}
            onAccountClick={handleAccountClick}
            onRetrySeries={() => void refetchSeries()}
          />
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
          skeleton={
            <AccountDetailsSkeleton account={selectedAccount} period={period} />
          }
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
    </HomePageFrame>
  )
}
