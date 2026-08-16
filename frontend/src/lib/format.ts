import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { MoneyWithSignSign } from '../api/models'
import type { AccountSubType, AccountType, MoneyWithSign } from '../api/models'

dayjs.extend(relativeTime)

export const HIDDEN_BALANCE_PLACEHOLDER = '****'

/**
 * Decimal places for currencies (smallest unit conversion)
 * Copied from backend/src/types/MoneyWithSign.ts
 */
const CURRENCY_DECIMALS: Record<string, number> = {
  // Major fiat currencies (ISO-4217)
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  CHF: 2,
  CNY: 2,
  INR: 2,
  MXN: 2,
  BRL: 2,
  // Zero-decimal currencies
  JPY: 0,
  KRW: 0,
  // Crypto currencies
  ETH: 18,
  BTC: 8,
}

/**
 * Check if a currency is a cryptocurrency
 */
function isCryptoCurrency(currency: string): boolean {
  const cryptoCurrencies = ['BTC', 'ETH'] // Add other cryptocurrencies as needed
  return cryptoCurrencies.includes(currency)
}

/**
 * Get decimal places for a currency, defaulting to 2 for unknown currencies
 */
export function getDecimalPlaces(currency: string): number {
  return CURRENCY_DECIMALS[currency] ?? 2
}

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
  const { value, decimals, appendCurrency = false } = input
  const decimalPlaces = getDecimalPlaces(value.money.currency)
  const dollars = value.money.amount / Math.pow(10, decimalPlaces)
  const signedAmount =
    value.sign === MoneyWithSignSign.negative ? -dollars : dollars
  return formatMoneyNumber({
    value: signedAmount,
    currency: value.money.currency,
    decimals: decimals, // Pass undefined if not provided, to let formatMoneyNumber handle crypto defaults
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
  const { value, currency = 'USD', decimals, appendCurrency = false } = input

  // Handle crypto currencies differently - without currency symbols
  if (isCryptoCurrency(currency)) {
    // Use up to 6 decimal places max for crypto currencies (with currency's specific decimal places as upper limit)
    const decimalPlaces = getDecimalPlaces(currency)
    const maxCryptoDecimals = 6 // Cap crypto display at 6 decimals for readability
    const cryptoDecimals = Math.min(
      decimals !== undefined ? decimals : decimalPlaces,
      maxCryptoDecimals,
      decimalPlaces,
    )
    const formattedValue = value.toFixed(cryptoDecimals)

    if (appendCurrency) {
      return `${formattedValue} (${currency})`
    } else {
      return formattedValue
    }
  }

  // For non-crypto currencies, default to the currency's native decimal places.
  const effectiveDecimals = decimals ?? getDecimalPlaces(currency)

  const overrideCurrency =
    CURRENCY_FORMATTING_OVERRIDES.get(currency) ?? currency
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    // When appending currency, avoid currency specific formatting
    currency: appendCurrency ? 'USD' : overrideCurrency,
    minimumFractionDigits: effectiveDecimals,
    maximumFractionDigits: effectiveDecimals,
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

/**
 * Format an ISO date or timestamp for display without shifting date-only values
 * across time zones.
 */
export function formatDateTime(value: string): string {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3]),
      )
    : new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(
    'en-US',
    dateOnlyMatch
      ? { dateStyle: 'medium' }
      : { dateStyle: 'medium', timeStyle: 'short' },
  ).format(date)
}

/**
 * Format a provider category hint into a readable name.
 * Strips the primary prefix and converts the detailed category to sentence case.
 *
 * @example
 * formatCategoryName({ primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' })
 * // => "Coffee"
 *
 * formatCategoryName({ primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CAR_PAYMENT' })
 * // => "Car payment"
 */
export function formatCategoryName(category: {
  primary: string
  detailed: string
}): string {
  const suffix = category.detailed.startsWith(`${category.primary}_`)
    ? category.detailed.slice(category.primary.length + 1)
    : category.detailed

  const normalized = suffix.toLowerCase().replace(/_/g, ' ')
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

/**
 * Format a primary category string for display.
 * Converts SCREAMING_SNAKE_CASE to sentence case.
 *
 * @example
 * formatPrimaryCategory('FOOD_AND_DRINK') // => "Food and drink"
 * formatPrimaryCategory('RENT_AND_UTILITIES') // => "Rent and utilities"
 * formatPrimaryCategory('UNCATEGORIZED') // => "Uncategorized"
 */
export function formatPrimaryCategory(primary: string): string {
  const normalized = primary.toLowerCase().replace(/_/g, ' ')
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

/**
 * Union type of all possible account type and subType values
 */
type AccountTypeValue = (typeof AccountType)[keyof typeof AccountType]
type AccountSubTypeValue = (typeof AccountSubType)[keyof typeof AccountSubType] // Use the actual values, not the keys
type AccountTypeOrSubType = AccountTypeValue | AccountSubTypeValue

/**
 * Format an account type or subType for display
 * Maps all AccountType and AccountSubType values from the API models to user-friendly labels
 * Handles special cases like "401k" -> "401(k)", "529" -> "529 Plan", etc.
 * For unknown types, falls back to capitalizing and formatting the string
 *
 * @example
 * formatAccountType('crypto_wallet')        // => "Crypto wallet"
 * formatAccountType('crypto exchange')      // => "Crypto exchange"
 * formatAccountType('checking')             // => "Checking"
 * formatAccountType('401k')                 // => "401(k)"
 */
export function formatAccountType(
  type: AccountTypeOrSubType | string | undefined | null,
): string {
  if (!type) return ''

  // Comprehensive mapping for all AccountType and AccountSubType values from API models
  const typeDisplayMap: Record<AccountTypeOrSubType, string> = {
    // Account Types from AccountType.ts
    investment: 'Investment',
    credit: 'Credit',
    depository: 'Depository',
    loan: 'Loan',
    brokerage: 'Brokerage',
    other: 'Other',
    crypto_wallet: 'Crypto wallet',

    // Account SubTypes from AccountSubType.ts - Alphanumeric
    '401a': '401(a)',
    '401k': '401(k)',
    '403B': '403(b)',
    '457b': '457(b)',
    '529': '529 plan',

    // Account SubTypes - Regular words
    auto: 'Auto',
    business: 'Business',
    'cash isa': 'Cash ISA',
    'cash management': 'Cash management',
    cd: 'CD',
    checking: 'Checking',
    commercial: 'Commercial',
    construction: 'Construction',
    consumer: 'Consumer',
    'credit card': 'Credit card',
    'crypto exchange': 'Crypto exchange', // Crypto-specific type
    ebt: 'EBT',
    'education savings account': 'Education savings account',
    'fixed annuity': 'Fixed annuity',
    gic: 'GIC',
    'health reimbursement arrangement': 'Health reimbursement arrangement',
    'home equity': 'Home equity',
    hsa: 'HSA',
    isa: 'ISA',
    ira: 'IRA',
    keogh: 'Keogh',
    lif: 'LIF',
    'life insurance': 'Life insurance',
    'line of credit': 'Line of credit',
    lira: 'LIRA',
    lrif: 'LRIF',
    lrsp: 'LRSP',
    'money market': 'Money market',
    mortgage: 'Mortgage',
    'mutual fund': 'Mutual fund',
    'non-custodial wallet': 'Non-custodial wallet', // Crypto-specific type
    'non-taxable brokerage account': 'Non-taxable brokerage account',
    'other insurance': 'Other insurance',
    'other annuity': 'Other annuity',
    overdraft: 'Overdraft',
    paypal: 'PayPal',
    payroll: 'Payroll',
    pension: 'Pension',
    prepaid: 'Prepaid',
    prif: 'PRIF',
    'profit sharing plan': 'Profit sharing plan',
    rdsp: 'RDSP',
    resp: 'RESP',
    retirement: 'Retirement',
    rlif: 'RLIF',
    roth: 'Roth',
    'roth 401k': 'Roth 401(k)',
    rrif: 'RRIF',
    rrsp: 'RRSP',
    sarsep: 'SARSEP',
    savings: 'Savings',
    'sep ira': 'SEP IRA',
    'simple ira': 'SIMPLE IRA',
    sipp: 'SIPP',
    'stock plan': 'Stock plan',
    student: 'Student',
    'thrift savings plan': 'Thrift savings plan',
    tfsa: 'TFSA',
    trust: 'Trust',
    ugma: 'UGMA',
    utma: 'UTMA',
    'variable annuity': 'Variable annuity',
  }

  // Return mapped value if found, otherwise use default formatting
  if (type in typeDisplayMap) {
    return typeDisplayMap[type as AccountTypeOrSubType]
  }

  // Default formatting: capitalize first letter and convert underscores to spaces
  // This handles any string values that aren't explicitly in our type definitions
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ')
}
