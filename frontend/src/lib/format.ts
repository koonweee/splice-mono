import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { MoneyWithSign } from '../api/models'
import { MoneyWithSignSign } from '../api/models'

dayjs.extend(relativeTime)

/**
 * Result of resolving which balance to display
 */
export interface ResolvedBalance {
  /** The primary balance to display (converted if available, otherwise original) */
  primaryBalance: MoneyWithSign
  /** The original balance in native currency (only set if different from primary) */
  originalBalance?: MoneyWithSign
}

/**
 * Resolve which balance to display given a current balance and optional converted balance.
 * Returns the converted balance as primary if it exists and differs in currency,
 * otherwise returns the current balance.
 *
 * @example
 * // No conversion needed (same currency or no converted balance)
 * resolveBalance(usdBalance, null)
 * // => { primaryBalance: usdBalance, originalBalance: null }
 *
 * // With conversion (different currencies)
 * resolveBalance(eurBalance, { balance: usdEquivalent, rate: 1.1, rateDate: '...' })
 * // => { primaryBalance: usdEquivalent, originalBalance: eurBalance }
 */
export function resolveBalance(
  currentBalance: MoneyWithSign,
  convertedBalance?: MoneyWithSign,
): ResolvedBalance {
  const hasConversion = !!convertedBalance

  return {
    primaryBalance: hasConversion ? convertedBalance : currentBalance,
    originalBalance: hasConversion ? currentBalance : undefined,
  }
}

/**
 * Format a MoneyWithSign value as a currency string
 * Converts from cents to dollars and applies the sign
 *
 * @example
 * formatMoneyWithSign({ value: { money: { amount: 12345, currency: 'USD' }, sign: 'positive' } })
 * // => "$123.45"
 *
 * formatMoneyWithSign({ value: { money: { amount: 12345, currency: 'USD' }, sign: 'negative' } })
 * // => "-$123.45"
 *
 * formatMoneyWithSign({ value: { money: { amount: 12345, currency: 'USD' }, sign: 'positive' }, decimals: 0 })
 * // => "$123"
 *
 * formatMoneyWithSign({ value: { money: { amount: 12345, currency: 'USD' }, sign: 'positive' }, appendCurrency: true })
 * // => "$123.45 ($USD)"
 */
export function formatMoneyWithSign(input: {
  value: MoneyWithSign
  decimals?: number
  appendCurrency?: boolean
}): string {
  const { value, decimals = 2, appendCurrency = false } = input
  const dollars = value.money.amount / 100
  const signedAmount =
    value.sign === MoneyWithSignSign.negative ? -dollars : dollars
  return formatMoneyNumber({
    value: signedAmount,
    currency: value.money.currency,
    decimals,
    appendCurrency,
  })
}

/** eg. override SGD to format with currency USD to get '$' prefix instead of 'SGD' */
const CURRENCY_FORMATTING_OVERRIDES = new Map<string, string>([['SGD', 'USD']])

/**
 * Format a number as a currency
 * For use with chart value formatters
 *
 * @example
 * formatUSD(123.45)    // => "$123.45"
 * formatUSD(123.45, 0) // => "$123"
 */
export function formatMoneyNumber(input: {
  value: number
  currency?: string
  decimals?: number
  appendCurrency?: boolean
}): string {
  const {
    value,
    currency = 'USD',
    decimals = 2,
    appendCurrency = false,
  } = input
  const overrideCurrency =
    CURRENCY_FORMATTING_OVERRIDES.get(currency) ?? currency
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    // When appending currency, avoid currency specific formatting
    currency: appendCurrency ? 'USD' : overrideCurrency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
  return appendCurrency ? `${formatted} (${currency})` : formatted
}

/**
 * Format a percentage value with sign prefix
 * Returns null for 0% changes (to hide them in the UI)
 *
 * @example
 * formatPercent(3.5)   // => "+3.50%"
 * formatPercent(-2.1)  // => "-2.10%"
 * formatPercent(0)     // => null
 * formatPercent(null)  // => null
 */
export function formatPercent(value?: number): string | undefined {
  if (value === undefined || value === 0) return undefined
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function getChangeColorMantine(
  isLiability: boolean,
  changePercent?: number,
): string {
  if (changePercent === undefined) return 'dimmed'
  const isPositive = changePercent > 0
  const isGood = isLiability ? !isPositive : isPositive
  return isGood ? 'teal' : 'red'
}

/**
 * Format a date as relative time (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(date: Date | string): string {
  return dayjs(date).fromNow()
}
