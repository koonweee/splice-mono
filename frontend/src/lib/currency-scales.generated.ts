// Generated from backend/src/common/currency-scales.ts. Do not edit.
/** Currency minor-unit scales; also generates the frontend registry. */
export const CURRENCY_DECIMALS: Readonly<Record<string, number>> = {
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
  JPY: 0,
  KRW: 0,
  ETH: 18,
  BTC: 8,
};

export function getDecimalPlaces(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}
