import { ExactDecimal, parseMinorUnits } from './money'
import type { Account, MoneyWithSign } from '../api/models'

type Settings = Pick<Account, 'expectedValuePercent' | 'expectedTaxPercent'>

export function hasAccountValueAdjustments(account: Settings) {
  return (
    !new ExactDecimal(account.expectedValuePercent ?? '100').eq(100) ||
    !new ExactDecimal(account.expectedTaxPercent ?? '0').eq(0)
  )
}

export function parseAccountPercentage(
  value: string,
  tax = false,
): string | undefined {
  const text = value.trim()
  if (text.length > 100 || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return
  const decimal = new ExactDecimal(text)
  if (
    !decimal.isFinite() ||
    (tax ? decimal.lt(0) || decimal.gt(100) : decimal.lte(0))
  )
    return
  return decimal.toFixed()
}

function ratio(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return {
    numerator: BigInt(whole + fraction),
    denominator: 10n ** BigInt(fraction.length),
  }
}

/** Exact preview of the server's combined percentage calculation, rounded once. */
export function adjustedAccountBalance(
  balance: MoneyWithSign,
  settings: Settings,
): MoneyWithSign {
  const value = ratio(settings.expectedValuePercent ?? '100')
  const tax = ratio(settings.expectedTaxPercent ?? '0')
  const numerator =
    parseMinorUnits(balance.money.amount) *
    value.numerator *
    (100n * tax.denominator - tax.numerator)
  const denominator = value.denominator * 10000n * tax.denominator
  const amount =
    numerator / denominator +
    (2n * (numerator % denominator) >= denominator ? 1n : 0n)
  parseMinorUnits(amount.toString())
  return {
    money: { ...balance.money, amount: amount.toString() },
    sign: balance.sign,
  }
}
