import Decimal from 'decimal.js'
import { getDecimalPlaces } from './currency-scales.generated'
import type { MoneyWithSign } from '../api/models'

/** Financial operations use an isolated context, never Decimal's default precision. */
export const ExactDecimal = Decimal.clone({
  precision: 200,
  rounding: Decimal.ROUND_HALF_UP,
})
const MINOR_PATTERN = /^(?:0|[1-9]\d{0,77})$/
const SIGNED_MINOR_PATTERN = /^-?(?:0|[1-9]\d{0,77})$/
const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/

export function parseMinorUnits(value: string): bigint {
  if (typeof value !== 'string' || !MINOR_PATTERN.test(value))
    throw new Error('Invalid minor-unit amount')
  return BigInt(value)
}

export function parseSignedMinorUnits(value: string): bigint {
  if (
    typeof value !== 'string' ||
    !SIGNED_MINOR_PATTERN.test(value) ||
    value === '-0'
  )
    throw new Error('Invalid signed minor-unit amount')
  return BigInt(value)
}

export function signedMinorUnits(value: MoneyWithSign): bigint {
  const amount = parseMinorUnits(value.money.amount)
  if (!new Set<string>(['positive', 'negative']).has(value.sign))
    throw new Error('Invalid money sign')
  return value.sign === 'negative' ? -amount : amount
}

export function moneyFromSignedMinorUnits(
  amount: bigint,
  currency: string,
): MoneyWithSign {
  const magnitude = (amount < 0n ? -amount : amount).toString()
  parseMinorUnits(magnitude)
  return {
    money: { amount: magnitude, currency },
    sign: amount < 0n ? 'negative' : 'positive',
  }
}

export function minorToMajorString(
  amount: string | bigint,
  currency: string,
): string {
  const integer =
    typeof amount === 'bigint' ? amount : parseSignedMinorUnits(amount)
  const negative = integer < 0n
  const digits = (negative ? -integer : integer).toString()
  const scale = getDecimalPlaces(currency)
  if (scale === 0) return `${negative ? '-' : ''}${digits}`
  const padded = digits.padStart(scale + 1, '0')
  const fraction = padded.slice(-scale).replace(/0+$/, '')
  return `${negative ? '-' : ''}${padded.slice(0, -scale)}${fraction ? `.${fraction}` : ''}`
}

export function moneyToMajorString(value: MoneyWithSign): string {
  return minorToMajorString(signedMinorUnits(value), value.money.currency)
}

/** Drafts are text. Excess fractional digits are rejected instead of rounded. */
export function parseMoneyDraft(
  value: string,
  currency: string,
): MoneyWithSign {
  const draft = value.trim()
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(draft))
    throw new Error('Enter a decimal amount')
  const negative = draft.startsWith('-')
  const [whole = '0', fraction = ''] = draft.replace(/^-/, '').split('.')
  const scale = getDecimalPlaces(currency)
  if (fraction.length > scale)
    throw new Error(`Use at most ${scale} decimal places for ${currency}`)
  const digits = `${whole || '0'}${fraction.padEnd(scale, '0')}`.replace(
    /^0+(?=\d)/,
    '',
  )
  const integer = parseMinorUnits(digits)
  return moneyFromSignedMinorUnits(negative ? -integer : integer, currency)
}

export function tryParseMoneyDraft(
  value: string,
  currency: string,
): MoneyWithSign | undefined {
  try {
    return parseMoneyDraft(value, currency)
  } catch {
    return undefined
  }
}

export function toggleMoneyDraftSign(value: string): string {
  const text = value.trim()
  if (text.startsWith('-')) return text.slice(1)
  return `-${text}`
}

/** Canonical decimal contract for major-unit conditions and provider values. */
export function decimalFromString(value: string): Decimal {
  if (
    typeof value !== 'string' ||
    !DECIMAL_PATTERN.test(value) ||
    value.length > 160
  )
    throw new Error('Invalid decimal amount')
  return new ExactDecimal(value)
}

export function isNonnegativeDecimal(value: string): boolean {
  try {
    return !decimalFromString(value).isNegative()
  } catch {
    return false
  }
}

export function compareIntegers(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** A ratio is presentation data; its numerator and denominator stay exact first. */
export function ratioPercent(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0
  const value = new ExactDecimal(numerator.toString())
    .div(denominator.toString())
    .mul(100)
    .toNumber()
  if (!Number.isFinite(value))
    throw new Error('Percentage is outside the display range')
  return value
}

/** Explicit approximation boundary for chart coordinates, never labels or totals. */
export function minorToChartNumber(
  amount: string | bigint,
  currency: string,
): number {
  const value = Number(minorToMajorString(amount, currency))
  if (!Number.isFinite(value))
    throw new Error('Amount is outside the chart range')
  return value
}

export function moneyToChartNumber(value: MoneyWithSign): number {
  return minorToChartNumber(signedMinorUnits(value), value.money.currency)
}
