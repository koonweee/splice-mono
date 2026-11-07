import {
  canonicalMinorUnits,
  decimalRateRatio,
  divideHalfUp,
  exactDecimal,
  type ExactRateRatio,
} from './exact-money';
import type { AccountValueAdjustments } from './account-value-adjustments';
import type { SerializedMoneyWithSign } from '../types/MoneyWithSign';

/** Current account assumptions apply to every valuation date, never to stored balances. */
export function accountValueRatio(
  settings: AccountValueAdjustments = {},
): ExactRateRatio {
  const value = decimalRateRatio(settings.expectedValuePercent ?? '100');
  const taxText = settings.expectedTaxPercent ?? '0';
  const tax = exactDecimal(taxText);
  if (tax.lt(0) || tax.gt(100)) throw new RangeError('Invalid expected tax');
  const [whole, fraction = ''] = taxText.split('.');
  const taxScale = 10n ** BigInt(fraction.length);
  const taxNumerator = BigInt(whole + fraction);
  return {
    numerator: (
      BigInt(value.numerator) *
      (100n * taxScale - taxNumerator)
    ).toString(),
    denominator: (BigInt(value.denominator) * 10000n * taxScale).toString(),
  };
}

export function calculateEffectiveBalance(
  currentBalance: SerializedMoneyWithSign,
  settings: AccountValueAdjustments = {},
): SerializedMoneyWithSign {
  const ratio = accountValueRatio(settings);
  if (ratio.numerator === ratio.denominator) return currentBalance;
  const amount = divideHalfUp(
    BigInt(canonicalMinorUnits(currentBalance.money.amount)) *
      BigInt(ratio.numerator),
    BigInt(ratio.denominator),
  );
  return {
    money: { ...currentBalance.money, amount: canonicalMinorUnits(amount) },
    sign: currentBalance.sign,
  };
}
