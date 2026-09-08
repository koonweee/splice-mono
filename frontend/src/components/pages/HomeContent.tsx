import { Grid } from '@mantine/core'
import { NetWorthCard } from '../NetWorthCard'
import { AccountSection } from '../AccountSection'
import type { AccountSummaryData, DashboardData } from '../../lib/balance-utils'
import type { ChartDataPoint } from '../Chart'
import type { TimePeriod } from '../../lib/types'

/** Data-free Home composition shared by live and saved launch views. */
export function HomeContent({
  dashboard,
  period,
  balancesHidden,
  visibleAssets,
  visibleLiabilities,
  isChangingPeriod = false,
  chartDisplayData,
  seriesLoading = false,
  seriesError = false,
  onPeriodChange,
  onAccountClick,
  onRetrySeries,
}: {
  dashboard: DashboardData
  period: TimePeriod
  balancesHidden: boolean
  visibleAssets: Array<AccountSummaryData>
  visibleLiabilities: Array<AccountSummaryData>
  isChangingPeriod?: boolean
  chartDisplayData?: Array<ChartDataPoint>
  seriesLoading?: boolean
  seriesError?: boolean
  onPeriodChange?: (period: TimePeriod) => void
  onAccountClick: (account: AccountSummaryData) => void
  onRetrySeries?: () => void
}) {
  return (
    <>
      <NetWorthCard
        period={period}
        onPeriodChange={onPeriodChange}
        balancesHidden={balancesHidden}
        netWorth={dashboard.netWorth}
        changePercent={dashboard.changePercent}
        changeAmount={dashboard.changeAmount}
        comparisonPeriod={dashboard.comparisonPeriod}
        comparisonLoading={isChangingPeriod}
        chartData={chartDisplayData ?? dashboard.chartData}
        chartLoading={seriesLoading}
        chartError={Boolean(seriesError)}
        onRetryChart={onRetrySeries}
      />

      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <AccountSection
            title="Assets"
            accounts={visibleAssets}
            balancesHidden={balancesHidden}
            comparisonLoading={isChangingPeriod}
            isLiability={false}
            onAccountClick={onAccountClick}
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <AccountSection
            title="Liabilities"
            accounts={visibleLiabilities}
            balancesHidden={balancesHidden}
            comparisonLoading={isChangingPeriod}
            isLiability={true}
            onAccountClick={onAccountClick}
          />
        </Grid.Col>
      </Grid>
    </>
  )
}
