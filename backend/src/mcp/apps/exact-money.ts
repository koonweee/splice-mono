import {
  ExactDecimal,
  exactDecimal,
  formatExactDecimal,
} from '../../common/exact-money';
import { getDecimalPlaces } from '../../common/currency-scales';

export { ExactDecimal, exactDecimal };

export interface AppMoney {
  readonly amount: string;
  readonly currency: string;
  readonly sign: 'positive' | 'negative';
}

/** Apps accept the same explicit major-unit string contract as their tools. */
export function parseAppMoney(
  value: unknown,
  expectedCurrency?: string,
): AppMoney | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.amount !== 'string' ||
    typeof record.currency !== 'string' ||
    !record.currency ||
    (record.sign !== 'positive' && record.sign !== 'negative') ||
    (expectedCurrency !== undefined && record.currency !== expectedCurrency)
  )
    return null;
  try {
    const amount = exactDecimal(record.amount);
    if (amount.isNegative()) return null;
    return {
      amount: amount.toFixed(),
      currency: record.currency,
      sign: amount.isZero() ? 'positive' : record.sign,
    };
  } catch {
    return null;
  }
}

export function signedAppMoney(value: AppMoney): string {
  return value.sign === 'negative' && value.amount !== '0'
    ? '-' + value.amount
    : value.amount;
}

export function compareDecimals(left: string, right: string): number {
  return exactDecimal(left).cmp(exactDecimal(right));
}

export function subtractDecimals(left: string, right: string): string {
  return exactDecimal(left).sub(exactDecimal(right)).toFixed();
}

export function sumDecimals(values: readonly string[]): string {
  return values
    .reduce((sum, value) => sum.add(exactDecimal(value)), new ExactDecimal(0))
    .toFixed();
}

/** Numeric percentages are geometry; the values used for labels remain exact. */
export function decimalPercentage(value: string, maximum: string): number {
  if (compareDecimals(maximum, '0') <= 0) return 0;
  return exactDecimal(value)
    .div(exactDecimal(maximum))
    .mul(100)
    .clamp(0, 100)
    .toNumber();
}

export function formatAppMoney(value: AppMoney): string {
  return formatExactDecimal(signedAppMoney(value), 'en-US', {
    style: 'currency',
    currency: value.currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: Math.min(getDecimalPlaces(value.currency), 6),
  });
}

export function formatAppQuantity(value: string): string {
  return formatExactDecimal(value, 'en-US', { maximumFractionDigits: 6 });
}
