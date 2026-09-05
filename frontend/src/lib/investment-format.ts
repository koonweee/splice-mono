import { DISPLAY_LOCALE, formatMoneyNumber, getDecimalPlaces } from './format'

interface InvestmentMoneyInput {
  /** Provider decimal string in major currency units, never MoneyWithSign minor units. */
  value: string | null
  currency: string
  showCurrencyCode?: boolean
}

/** Shares and units are quantities; do not apply currency precision to them. */
export function formatInvestmentQuantity(value: string | null): string {
  if (value === null) return '--'
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return value

  return new Intl.NumberFormat(DISPLAY_LOCALE, {
    maximumFractionDigits: 6,
  }).format(numericValue)
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
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return value

  const fractionDigits = value.split('.')[1]?.replace(/0+$/, '').length ?? 0
  const decimals = preserveFractionalPrecision
    ? Math.min(4, Math.max(getDecimalPlaces(currency), fractionDigits))
    : undefined

  return formatMoneyNumber({
    value: numericValue,
    currency,
    decimals,
    appendCurrency: currency.length !== 3,
    currencyDisplay:
      showCurrencyCode && currency.length === 3 ? 'code' : 'symbol',
  })
}
