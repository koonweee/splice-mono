import {
  DISPLAY_LOCALE,
  formatMajorMoneyString,
  getDecimalPlaces,
} from './format'
import { decimalFromString } from './money'

interface InvestmentMoneyInput {
  /** Provider decimal string in major currency units, never MoneyWithSign minor units. */
  value: string | null
  currency: string
  showCurrencyCode?: boolean
}

/** Shares and units are quantities; do not apply currency precision to them. */
export function formatInvestmentQuantity(value: string | null): string {
  if (value === null) return '--'
  try {
    const fixed = decimalFromString(value).toDecimalPlaces(6).toFixed(6)
    const [integer, fraction] = fixed.split('.')
    const trimmed = fraction.replace(/0+$/, '')
    const formatted = new Intl.NumberFormat(DISPLAY_LOCALE, {
      maximumFractionDigits: 0,
    }).format(BigInt(integer))
    const sign = fixed.startsWith('-') && BigInt(integer) === 0n ? '-' : ''
    return sign + formatted + (trimmed ? '.' + trimmed : '')
  } catch {
    return value
  }
}

/** Quotes retain up to four decimals, ignoring provider storage padding. */
export function formatInvestmentQuote(input: InvestmentMoneyInput): string {
  return formatInvestmentValue({ ...input, preserveFractionalPrecision: true })
}

/** Values use currency precision; fractional fees can retain up to four decimals. */
export function formatInvestmentValue({
  value,
  currency,
  showCurrencyCode = false,
  preserveFractionalPrecision = false,
}: InvestmentMoneyInput & { preserveFractionalPrecision?: boolean }): string {
  if (value === null) return '--'
  try {
    decimalFromString(value)
  } catch {
    return value
  }

  const fractionDigits = value.split('.')[1]?.replace(/0+$/, '').length ?? 0
  const decimals = preserveFractionalPrecision
    ? Math.min(4, Math.max(getDecimalPlaces(currency), fractionDigits))
    : undefined

  return formatMajorMoneyString({
    value,
    currency,
    decimals,
    appendCurrency: currency.length !== 3,
    currencyDisplay:
      showCurrencyCode && currency.length === 3 ? 'code' : 'symbol',
  })
}
