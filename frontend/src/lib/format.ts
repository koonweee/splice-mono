import type { MoneyWithSign } from '../api/models'
import { MoneyWithSignSign } from '../api/models'

/**
 * Format a MoneyWithSign value as a currency string
 * Converts from cents to dollars and applies the sign
 *
 * @example
 * formatMoneyWithSign({ money: { amount: 12345, currency: 'USD' }, sign: 'positive' })
 * // => "$123.45"
 *
 * formatMoneyWithSign({ money: { amount: 12345, currency: 'USD' }, sign: 'negative' })
 * // => "-$123.45"
 *
 * formatMoneyWithSign({ money: { amount: 12345, currency: 'USD' }, sign: 'positive' }, 0)
 * // => "$123"
 */
export function formatMoneyWithSign(
  value: MoneyWithSign,
  decimals: number = 2,
): string {
  const dollars = value.money.amount / 100
  const signedAmount =
    value.sign === MoneyWithSignSign.negative ? -dollars : dollars
  return formatMoneyNumber({
    value: signedAmount,
    currency: value.money.currency,
    decimals,
  })
}

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
}): string {
  const { value, currency = 'USD', decimals = 2 } = input
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
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
export function formatPercent(value: number | null): string | null {
  if (value === null || value === 0) return null
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

/**
 * Get the color class for a percentage change based on context
 *
 * For assets/net worth: positive change is good (green), negative is bad (red)
 * For liabilities: negative change is good (green), positive is bad (red)
 *
 * @param changePercent - The percentage change value
 * @param isLiability - Whether this is for a liability (inverts the color logic)
 * @returns Tailwind color class string
 *
 * @example
 * getChangeColor(5, false)   // => "text-green-600" (asset increased)
 * getChangeColor(-5, false)  // => "text-red-600" (asset decreased)
 * getChangeColor(5, true)    // => "text-red-600" (liability increased - bad)
 * getChangeColor(-5, true)   // => "text-green-600" (liability decreased - good)
 */
export function getChangeColor(
  changePercent: number | null,
  isLiability: boolean,
): string {
  if (changePercent === null) return ''
  const isPositiveChange = changePercent >= 0
  // For liabilities, we invert the logic: decreasing debt is good
  const isGood = isLiability ? !isPositiveChange : isPositiveChange
  return isGood ? 'text-green-600' : 'text-red-600'
}
