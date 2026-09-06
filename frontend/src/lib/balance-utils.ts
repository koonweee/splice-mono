import dayjs from 'dayjs'
import { AccountType } from '../api/models'
import {
  compareIntegers,
  moneyFromSignedMinorUnits,
  moneyToChartNumber,
  moneyToMajorString,
  parseMoneyDraft,
  ratioPercent,
  signedMinorUnits,
} from './money'
import { TimePeriod } from './types'
import type { ChartDataPoint } from '../components/Chart'
import type {
  AccountBalanceResult,
  AccountValuationMode,
  BalanceQueryPerDateResult,
  BalanceWithConvertedBalance,
  MoneyWithSign,
} from '../api/models'

type AccountTypeValue = (typeof AccountType)[keyof typeof AccountType]

/**
 * Liability account types - debt that decreases net worth
 */
const LIABILITY_TYPES: Array<AccountTypeValue> = [
  AccountType.credit,
  AccountType.loan,
]

/**
 * Check if an account type is a liability
 */
export function isLiabilityType(type: AccountTypeValue): boolean {
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
  [TimePeriod.threeYears]: 365 * 3,
  [TimePeriod.fiveYears]: 365 * 5,
  [TimePeriod.tenYears]: 365 * 10,
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
export function getSignedAmount(balance: MoneyWithSign): string {
  return moneyToMajorString(balance)
}

/**
 * Resolve the effective balance, preferring converted if available
 */
export function resolveEffectiveBalance(
  balance: BalanceWithConvertedBalance,
): MoneyWithSign {
  return balance.convertedBalance ?? balance.balance
}

export class BalanceCurrencyMismatchError extends Error {
  readonly code = 'BALANCE_CURRENCY_MISMATCH'

  constructor(
    readonly expectedCurrency: string,
    readonly actualCurrency: string,
  ) {
    super(
      `Cannot combine ${actualCurrency} balances with ${expectedCurrency} balances`,
    )
    this.name = 'BalanceCurrencyMismatchError'
  }
}

function normalizeCurrency(currency: string): string {
  return currency.toUpperCase()
}

function resolveConsistentCurrency(
  balance: MoneyWithSign,
  expectedCurrency: string | undefined,
): string | undefined {
  const actualCurrency = normalizeCurrency(balance.money.currency)
  // Zero does not establish or change a total's unit. This lets a later
  // non-zero balance choose the reporting currency when user settings have not
  // loaded yet, while callers may retain a zero-only display fallback.
  if (balance.money.amount === '0') return expectedCurrency

  if (expectedCurrency !== undefined && actualCurrency !== expectedCurrency) {
    throw new BalanceCurrencyMismatchError(expectedCurrency, actualCurrency)
  }

  return actualCurrency
}

function resolveDifferenceCurrency(
  current: MoneyWithSign,
  previous: MoneyWithSign,
  fallbackCurrency: string,
): string {
  if (current.money.amount !== '0') {
    return normalizeCurrency(current.money.currency)
  }
  if (previous.money.amount !== '0') {
    return normalizeCurrency(previous.money.currency)
  }
  return fallbackCurrency
}

export function isZeroBalanceAccount(
  account: Pick<
    AccountSummaryData,
    'effectiveBalance' | 'convertedEffectiveBalance'
  >,
): boolean {
  const effectiveBalance =
    account.convertedEffectiveBalance ?? account.effectiveBalance
  return effectiveBalance.money.amount === '0'
}

/**
 * Calculate net worth for a single date's balances
 * Net worth = sum of asset balances - sum of liability balances
 */
export function calculateNetWorthForDate(
  balances: Record<string, AccountBalanceResult>,
  expectedCurrency?: string,
): bigint {
  let netWorth = 0n
  let currency = expectedCurrency
    ? normalizeCurrency(expectedCurrency)
    : undefined

  Object.values(balances).forEach((result) => {
    const effectiveBalance = resolveEffectiveBalance(result.effectiveBalance)
    currency = resolveConsistentCurrency(effectiveBalance, currency)
    const amount = signedMinorUnits(effectiveBalance)

    if (isLiabilityType(result.account.type)) {
      // Liabilities subtract from net worth
      // Note: liability balances are typically positive amounts owed
      netWorth -= amount < 0n ? -amount : amount
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
  current: bigint,
  previous: bigint,
): number | undefined {
  if (previous === 0n) return undefined
  return ratioPercent(current - previous, previous < 0n ? -previous : previous)
}

/** Parse a decimal text draft in major units into the HTTP minor-unit contract. */
export function createMoneyWithSign(
  amount: string,
  currency: string,
): MoneyWithSign {
  return parseMoneyDraft(amount, currency)
}

function downsampleChartResults(
  results: Array<BalanceQueryPerDateResult>,
  period: TimePeriod,
): Array<BalanceQueryPerDateResult> {
  const shouldDownsample = [
    TimePeriod.year,
    TimePeriod.threeYears,
    TimePeriod.fiveYears,
    TimePeriod.tenYears,
  ].includes(period)

  if (!shouldDownsample) return results

  return results.filter(
    (result, index) =>
      dayjs(result.date).date() === 1 || index === results.length - 1,
  )
}

/**
 * Account summary data for display in dashboard
 * Matches the AccountSummary interface from the API for component compatibility
 */
export interface AccountSummaryData {
  id: string
  name: string
  customName?: string | null
  type: AccountTypeValue
  subType?: string
  effectiveBalance: MoneyWithSign
  convertedEffectiveBalance?: MoneyWithSign
  changePercent?: number
  changeAmount?: MoneyWithSign
  institutionName?: string
  syncedAt?: string
  archivedAt?: string | null
  valuationMode: AccountValuationMode
}

/**
 * Dashboard data structure matching what the UI expects
 */
export interface DashboardData {
  netWorth: MoneyWithSign
  changePercent?: number
  changeAmount?: MoneyWithSign
  comparisonPeriod: TimePeriod
  chartData: Array<ChartDataPoint>
  assets: Array<AccountSummaryData>
  liabilities: Array<AccountSummaryData>
}

/**
 * Transform balance query results into dashboard data
 */
export function transformToDashboardData(
  results: Array<BalanceQueryPerDateResult>,
  period: TimePeriod,
  reportingCurrency?: string,
): DashboardData {
  // Sort results by date ascending
  const sortedResults = [...results].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  // Get first and last results for change calculation
  const firstResult = sortedResults.length > 0 ? sortedResults[0] : undefined
  const lastResult =
    sortedResults.length > 0
      ? sortedResults[sortedResults.length - 1]
      : undefined

  // Validate the complete time series before producing any totals. Carrying
  // the currency forward also prevents a chart from silently changing units.
  let currency = reportingCurrency
    ? normalizeCurrency(reportingCurrency)
    : undefined
  let zeroOnlyCurrency: string | undefined
  const netWorthByDate = new Map<string, bigint>()
  sortedResults.forEach((result) => {
    const effectiveBalances = Object.values(result.balances).map((balance) =>
      resolveEffectiveBalance(balance.effectiveBalance),
    )
    effectiveBalances.forEach((balance) => {
      if (balance.money.amount === '0') {
        zeroOnlyCurrency ??= normalizeCurrency(balance.money.currency)
      }
      currency = resolveConsistentCurrency(balance, currency)
    })
    netWorthByDate.set(
      result.date,
      calculateNetWorthForDate(result.balances, currency ?? zeroOnlyCurrency),
    )
  })

  const firstNetWorth = firstResult
    ? (netWorthByDate.get(firstResult.date) ?? 0n)
    : 0n
  const lastNetWorth = lastResult
    ? (netWorthByDate.get(lastResult.date) ?? 0n)
    : 0n

  // Calculate period change
  const changePercent = calculateChangePercent(lastNetWorth, firstNetWorth)

  const displayCurrency = currency ?? zeroOnlyCurrency ?? 'USD'
  const changeAmount = moneyFromSignedMinorUnits(
    lastNetWorth - firstNetWorth,
    displayCurrency,
  )

  // Build chart data from all dates
  const chartData: Array<ChartDataPoint> = downsampleChartResults(
    sortedResults,
    period,
  ).map((result) => ({
    date: result.date,
    label: dayjs(result.date).format('MMM D'),
    value: moneyToChartNumber(
      moneyFromSignedMinorUnits(
        netWorthByDate.get(result.date) ?? 0n,
        displayCurrency,
      ),
    ),
    money: moneyFromSignedMinorUnits(
      netWorthByDate.get(result.date) ?? 0n,
      displayCurrency,
    ),
  }))

  // Build account summaries from last result
  const assets: Array<AccountSummaryData> = []
  const liabilities: Array<AccountSummaryData> = []

  if (lastResult) {
    Object.entries(lastResult.balances).forEach(
      ([accountId, accountResult]) => {
        // Find this account in first result for change calculation
        const firstAccountResult = firstResult?.balances[accountId]

        const currentEffective = resolveEffectiveBalance(
          accountResult.effectiveBalance,
        )
        const currentAmount = signedMinorUnits(currentEffective)

        let accountChangePercent: number | undefined = undefined
        let accountChangeAmount: MoneyWithSign | undefined = undefined
        if (firstAccountResult) {
          const previousEffective = resolveEffectiveBalance(
            firstAccountResult.effectiveBalance,
          )
          const previousAmount = signedMinorUnits(previousEffective)
          accountChangePercent = calculateChangePercent(
            currentAmount,
            previousAmount,
          )
          accountChangeAmount = moneyFromSignedMinorUnits(
            currentAmount - previousAmount,
            resolveDifferenceCurrency(
              currentEffective,
              previousEffective,
              displayCurrency,
            ),
          )
        }

        const summary: AccountSummaryData = {
          id: accountId,
          name: accountResult.account.name ?? '',
          customName: accountResult.account.customName,
          type: accountResult.account.type,
          subType: accountResult.account.subType ?? undefined,
          effectiveBalance: accountResult.effectiveBalance.balance,
          convertedEffectiveBalance:
            accountResult.effectiveBalance.convertedBalance,
          changePercent: accountChangePercent,
          changeAmount: accountChangeAmount,
          institutionName:
            accountResult.account.bankLink?.institutionName ?? undefined,
          syncedAt: getLatestAccountSyncedAt(
            sortedResults,
            accountId,
          )?.toISOString(),
          archivedAt: accountResult.account.archivedAt,
          valuationMode: accountResult.account.valuationMode,
        }

        if (isLiabilityType(accountResult.account.type)) {
          liabilities.push(summary)
        } else {
          assets.push(summary)
        }
      },
    )
  }
  // Sort assets and liabilities by effective balance of the last result (descending)
  const sortedAssets = assets.sort((a, b) =>
    compareIntegers(
      signedMinorUnits(b.convertedEffectiveBalance ?? b.effectiveBalance),
      signedMinorUnits(a.convertedEffectiveBalance ?? a.effectiveBalance),
    ),
  )
  const sortedLiabilities = liabilities.sort((a, b) =>
    compareIntegers(
      signedMinorUnits(b.convertedEffectiveBalance ?? b.effectiveBalance),
      signedMinorUnits(a.convertedEffectiveBalance ?? a.effectiveBalance),
    ),
  )

  return {
    netWorth: moneyFromSignedMinorUnits(lastNetWorth, displayCurrency),
    changePercent,
    changeAmount,
    comparisonPeriod: period,
    chartData,
    assets: sortedAssets,
    liabilities: sortedLiabilities,
  }
}

/**
 * Transform balance query results into chart data for a single account
 */
export function transformToAccountChartData(
  results: Array<BalanceQueryPerDateResult>,
  accountId: string,
  period: TimePeriod,
): Array<ChartDataPoint> {
  // Sort results by date ascending
  const sortedResults = [...results].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  let currency: string | undefined

  return downsampleChartResults(sortedResults, period)
    .map((result) => {
      const accountResult =
        accountId in result.balances ? result.balances[accountId] : undefined
      if (!accountResult) return null

      const effectiveBalance = resolveEffectiveBalance(
        accountResult.effectiveBalance,
      )
      currency = resolveConsistentCurrency(effectiveBalance, currency)
      return {
        date: result.date,
        label: dayjs(result.date).format('MMM D'),
        value: moneyToChartNumber(effectiveBalance),
        money: effectiveBalance,
      }
    })
    .filter((point): point is ChartDataPoint => point !== null)
}

/**
 * Get the latest balance result for an account from query results
 */
export function getLatestAccountBalance(
  results: Array<BalanceQueryPerDateResult>,
  accountId: string,
): AccountBalanceResult | undefined {
  // Sort by date descending to get latest
  const sortedResults = [...results].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  const matchingResult = sortedResults.find(
    (result) => accountId in result.balances,
  )
  return matchingResult?.balances[accountId]
}

/**
 * Get the most recent syncedAt timestamp for an account from query results
 * Returns undefined if no synced snapshots exist (all were forward-filled)
 */
export function getLatestSyncedAt(
  results: Array<BalanceQueryPerDateResult>,
  accountId: string,
): Date | undefined {
  let latest: Date | undefined

  results.forEach((result) => {
    const balance =
      accountId in result.balances ? result.balances[accountId] : undefined
    if (balance?.syncedAt) {
      const syncedAt = new Date(balance.syncedAt)
      if (!latest || syncedAt > latest) {
        latest = syncedAt
      }
    }
  })

  return latest
}

/**
 * Get the most recent account-level sync timestamp from query results.
 * Falls back to per-date syncedAt for API responses generated before
 * latestSyncedAt existed.
 */
export function getLatestAccountSyncedAt(
  results: Array<BalanceQueryPerDateResult>,
  accountId: string,
): Date | undefined {
  let latest: Date | undefined

  results.forEach((result) => {
    const balance =
      accountId in result.balances ? result.balances[accountId] : undefined
    const latestSyncedAt = balance?.latestSyncedAt
      ? new Date(balance.latestSyncedAt)
      : undefined
    if (latestSyncedAt && (!latest || latestSyncedAt > latest)) {
      latest = latestSyncedAt
    }
  })

  return latest ?? getLatestSyncedAt(results, accountId)
}
