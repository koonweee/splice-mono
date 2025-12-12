import dayjs from 'dayjs'
import type {
  AccountBalanceResult,
  BalanceQueryPerDateResult,
  BalanceWithConvertedBalance,
  MoneyWithSign,
} from '../api/models'
import { AccountType, MoneyWithSignSign } from '../api/models'
import type { ChartDataPoint } from '../components/Chart'
import { TimePeriod } from './types'

/**
 * Liability account types - debt that decreases net worth
 */
const LIABILITY_TYPES: AccountType[] = [AccountType.credit, AccountType.loan]

/**
 * Check if an account type is a liability
 */
export function isLiabilityType(type: AccountType): boolean {
  return LIABILITY_TYPES.includes(type)
}

/**
 * Period to number of days mapping
 */
const PERIOD_DAYS: Record<TimePeriod, number> = {
  [TimePeriod.day]: 1,
  [TimePeriod.week]: 7,
  [TimePeriod.month]: 30,
  [TimePeriod.year]: 365,
}

/**
 * Get start and end dates for a time period
 */
export function getDateRange(period: TimePeriod): {
  startDate: string
  endDate: string
} {
  const endDate = dayjs().format('YYYY-MM-DD')
  const startDate = dayjs()
    .subtract(PERIOD_DAYS[period], 'day')
    .format('YYYY-MM-DD')
  return { startDate, endDate }
}

/**
 * Extract a signed numeric value from a MoneyWithSign (in dollars)
 */
export function getSignedAmount(balance: MoneyWithSign): number {
  const dollars = balance.money.amount / 100
  return balance.sign === MoneyWithSignSign.negative ? -dollars : dollars
}

/**
 * Resolve the effective balance, preferring converted if available
 */
export function resolveEffectiveBalance(
  balance: BalanceWithConvertedBalance,
): MoneyWithSign {
  return balance.convertedBalance ?? balance.balance
}

/**
 * Calculate net worth for a single date's balances
 * Net worth = sum of asset balances - sum of liability balances
 */
export function calculateNetWorthForDate(
  balances: Record<string, AccountBalanceResult>,
): number {
  let netWorth = 0

  Object.values(balances).forEach((result) => {
    const effectiveBalance = resolveEffectiveBalance(result.effectiveBalance)
    const amount = getSignedAmount(effectiveBalance)

    if (isLiabilityType(result.account.type)) {
      // Liabilities subtract from net worth
      // Note: liability balances are typically positive amounts owed
      netWorth -= Math.abs(amount)
    } else {
      // Assets add to net worth
      netWorth += amount
    }
  })

  return netWorth
}

/**
 * Calculate percentage change between two values
 * Returns null if previous value is 0 (can't calculate percentage change)
 */
export function calculateChangePercent(
  current: number,
  previous: number,
): number | undefined {
  if (previous === 0) return undefined
  return ((current - previous) / Math.abs(previous)) * 100
}

/**
 * Create a MoneyWithSign object from a dollar amount
 */
export function createMoneyWithSign(
  amount: number,
  currency: string,
): MoneyWithSign {
  const isNegative = amount < 0
  return {
    money: {
      amount: Math.round(Math.abs(amount) * 100),
      currency,
    },
    sign: isNegative ? MoneyWithSignSign.negative : MoneyWithSignSign.positive,
  }
}

/**
 * Account summary data for display in dashboard
 * Matches the AccountSummary interface from the API for component compatibility
 */
export interface AccountSummaryData {
  id: string
  name: string
  type: AccountType
  subType?: string
  effectiveBalance: MoneyWithSign
  convertedEffectiveBalance?: MoneyWithSign
  changePercent?: number
  institutionName?: string
}

/**
 * Dashboard data structure matching what the UI expects
 */
export interface DashboardData {
  netWorth: MoneyWithSign
  changePercent?: number
  comparisonPeriod: TimePeriod
  chartData: ChartDataPoint[]
  assets: AccountSummaryData[]
  liabilities: AccountSummaryData[]
}

/**
 * Transform balance query results into dashboard data
 */
export function transformToDashboardData(
  results: BalanceQueryPerDateResult[],
  period: TimePeriod,
): DashboardData {
  // Sort results by date ascending
  const sortedResults = [...results].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  // Get first and last results for change calculation
  const firstResult = sortedResults[0]
  const lastResult = sortedResults[sortedResults.length - 1]

  // Calculate net worth for first and last dates
  const firstNetWorth = firstResult
    ? calculateNetWorthForDate(firstResult.balances)
    : 0
  const lastNetWorth = lastResult
    ? calculateNetWorthForDate(lastResult.balances)
    : 0

  // Calculate percentage change
  const changePercent = calculateChangePercent(lastNetWorth, firstNetWorth)

  // Determine currency from first account (assume all converted to same currency)
  const firstAccount = lastResult ? Object.values(lastResult.balances)[0] : null
  const currency = firstAccount
    ? (resolveEffectiveBalance(firstAccount.effectiveBalance).money.currency ??
      'USD')
    : 'USD'

  // Build chart data from all dates
  const chartData: ChartDataPoint[] = sortedResults.map((result) => ({
    label: dayjs(result.date).format('MMM D'),
    value: calculateNetWorthForDate(result.balances),
  }))

  // Build account summaries from last result
  const assets: AccountSummaryData[] = []
  const liabilities: AccountSummaryData[] = []

  if (lastResult) {
    Object.entries(lastResult.balances).forEach(([accountId, accountResult]) => {
      // Find this account in first result for change calculation
      const firstAccountResult = firstResult?.balances[accountId]

      const currentEffective = resolveEffectiveBalance(
        accountResult.effectiveBalance,
      )
      const currentAmount = getSignedAmount(currentEffective)

      let accountChangePercent: number | undefined = undefined
      if (firstAccountResult) {
        const previousEffective = resolveEffectiveBalance(
          firstAccountResult.effectiveBalance,
        )
        const previousAmount = getSignedAmount(previousEffective)
        accountChangePercent = calculateChangePercent(
          currentAmount,
          previousAmount,
        )
      }

      const summary: AccountSummaryData = {
        id: accountId,
        name: accountResult.account.name ?? '',
        type: accountResult.account.type,
        subType: accountResult.account.subType ?? undefined,
        effectiveBalance: accountResult.effectiveBalance.balance,
        convertedEffectiveBalance:
          accountResult.effectiveBalance.convertedBalance,
        changePercent: accountChangePercent,
        institutionName:
          accountResult.account.bankLink?.institutionName ?? undefined,
      }

      if (isLiabilityType(accountResult.account.type)) {
        liabilities.push(summary)
      } else {
        assets.push(summary)
      }
    })
  }

  return {
    netWorth: createMoneyWithSign(lastNetWorth, currency),
    changePercent,
    comparisonPeriod: period,
    chartData,
    assets,
    liabilities,
  }
}

/**
 * Transform balance query results into chart data for a single account
 */
export function transformToAccountChartData(
  results: BalanceQueryPerDateResult[],
  accountId: string,
): ChartDataPoint[] {
  // Sort results by date ascending
  const sortedResults = [...results].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  return sortedResults
    .map((result) => {
      const accountResult = result.balances[accountId]
      if (!accountResult) return null

      const effectiveBalance = resolveEffectiveBalance(
        accountResult.effectiveBalance,
      )
      const amount = getSignedAmount(effectiveBalance)

      return {
        label: dayjs(result.date).format('MMM D'),
        value: amount,
      }
    })
    .filter((point): point is ChartDataPoint => point !== null)
}

/**
 * Get the latest balance result for an account from query results
 */
export function getLatestAccountBalance(
  results: BalanceQueryPerDateResult[],
  accountId: string,
): AccountBalanceResult | undefined {
  // Sort by date descending to get latest
  const sortedResults = [...results].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  const matchingResult = sortedResults.find(
    (result) => result.balances[accountId],
  )
  return matchingResult?.balances[accountId]
}

/**
 * Get the most recent syncedAt timestamp for an account from query results
 * Returns undefined if no synced snapshots exist (all were forward-filled)
 */
export function getLatestSyncedAt(
  results: BalanceQueryPerDateResult[],
  accountId: string,
): Date | undefined {
  let latest: Date | undefined

  results.forEach((result) => {
    const balance = result.balances[accountId]
    if (balance?.syncedAt) {
      const syncedAt = new Date(balance.syncedAt)
      if (!latest || syncedAt > latest) {
        latest = syncedAt
      }
    }
  })

  return latest
}
