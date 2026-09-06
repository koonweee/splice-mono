import Decimal from 'decimal.js';
import { MoneySign } from './money-sign';
import { getDecimalPlaces } from './currency-scales';
import type { SerializedMoneyWithSign } from '../types/MoneyWithSign';

/** Isolated precision: 78-digit money + currency scales + rate/price intermediates. */
export const ExactDecimal = Decimal.clone({
  precision: 200,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -1000,
  toExpPos: 1000,
});

export const MAX_MINOR_DIGITS = 78;
export const MINOR_UNIT_PATTERN = /^(0|[1-9]\d{0,77})$/;
export const SIGNED_MINOR_UNIT_PATTERN = /^(0|-?[1-9]\d{0,77})$/;
export const DECIMAL_PATTERN = /^(0|[1-9]\d*)(\.\d+)?$/;
export const SIGNED_DECIMAL_PATTERN = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** Numbers are permitted only as safe integer internal inputs, never in JSON contracts. */
export function canonicalMinorUnits(value: string | bigint | number): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError(
      'Minor units must be a safe integer or exact decimal string',
    );
  }
  const text = String(value);
  if (!MINOR_UNIT_PATTERN.test(text)) {
    throw new RangeError(
      'Minor units must be a nonnegative canonical integer of at most 78 digits',
    );
  }
  return text;
}

export function exactDecimal(value: string): Decimal {
  if (
    typeof value !== 'string' ||
    value.length > 200 ||
    !SIGNED_DECIMAL_PATTERN.test(value)
  ) {
    throw new RangeError(
      'Amount must be finite decimal text without exponent notation',
    );
  }
  return new ExactDecimal(value);
}

export function minorToMajorString(
  amount: string | bigint,
  currency: string,
): string {
  const text = canonicalMinorUnits(amount);
  const scale = getDecimalPlaces(currency);
  if (scale === 0) return text;
  const padded = text.padStart(scale + 1, '0');
  const fraction = padded.slice(-scale).replace(/0+$/, '');
  return `${padded.slice(0, -scale)}${fraction ? `.${fraction}` : ''}`;
}

/** Provider/valuation boundary: quantize the magnitude once, with decimal half-up rounding. */
export function majorToMinorString(amount: string, currency: string): string {
  const decimal = exactDecimal(amount).abs();
  return canonicalMinorUnits(
    decimal
      .mul(new ExactDecimal(10).pow(getDecimalPlaces(currency)))
      .toFixed(0),
  );
}

export function signedMinorUnits(money: SerializedMoneyWithSign): bigint {
  const value = BigInt(canonicalMinorUnits(money.money.amount));
  if (money.sign !== MoneySign.POSITIVE && money.sign !== MoneySign.NEGATIVE)
    throw new RangeError('Invalid money sign');
  return money.sign === MoneySign.NEGATIVE ? -value : value;
}

export function moneyFromSignedMinorUnits(
  amount: bigint | string,
  currency: string,
): SerializedMoneyWithSign {
  const value = BigInt(amount);
  return {
    money: {
      currency,
      amount: canonicalMinorUnits(value < 0n ? -value : value),
    },
    sign: value < 0n ? MoneySign.NEGATIVE : MoneySign.POSITIVE,
  };
}

export function compareMinorUnits(
  left: string | bigint,
  right: string | bigint,
): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n || numerator < 0n)
    throw new RangeError(
      'Rounding requires a nonnegative numerator and positive denominator',
    );
  const quotient = numerator / denominator;
  return quotient + (2n * (numerator % denominator) >= denominator ? 1n : 0n);
}

export type ExactRateRatio = { numerator: string; denominator: string };

export function decimalRateRatio(
  rate: string,
  inverted = false,
): ExactRateRatio {
  const value = exactDecimal(rate);
  if (!value.isPositive())
    throw new RangeError('Exchange rate must be positive');
  const [whole, fraction = ''] = rate.split('.');
  const numerator = BigInt(`${whole}${fraction}`);
  const denominator = 10n ** BigInt(fraction.length);
  return inverted
    ? { numerator: denominator.toString(), denominator: numerator.toString() }
    : { numerator: numerator.toString(), denominator: denominator.toString() };
}

/** Integer ratio rounding also preserves inverse-rate ties at the 78-digit boundary. */
export function convertMinorUnits(
  amount: string,
  sourceCurrency: string,
  targetCurrency: string,
  rate: string | ExactRateRatio,
): string {
  const ratio = typeof rate === 'string' ? decimalRateRatio(rate) : rate;
  const numerator =
    BigInt(canonicalMinorUnits(amount)) *
    BigInt(ratio.numerator) *
    10n ** BigInt(getDecimalPlaces(targetCurrency));
  const denominator =
    BigInt(ratio.denominator) * 10n ** BigInt(getDecimalPlaces(sourceCurrency));
  return canonicalMinorUnits(divideHalfUp(numerator, denominator));
}

/** The only financial-to-number adapter: a bounded presentation ratio, never stored money. */
export function moneyRatio(
  numerator: bigint | string,
  denominator: bigint | string,
): number {
  if (BigInt(denominator) === 0n) return 0;
  const ratio = new ExactDecimal(numerator.toString())
    .div(denominator.toString())
    .toNumber();
  if (!Number.isFinite(ratio))
    throw new RangeError('Presentation ratio is outside the finite range');
  return ratio;
}

/** Modern Intl accepts decimal strings exactly; retain the TS-compatible signature locally. */
export function formatExactDecimal(
  value: string,
  locale: string,
  options: Intl.NumberFormatOptions,
): string {
  exactDecimal(value);
  const formatter = new Intl.NumberFormat(locale, options);
  return (
    formatter as Intl.NumberFormat & { format(value: string): string }
  ).format(value);
}
