import {
  getDecimalPlaces,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';

export interface McpMoney {
  amount: number;
  currency: string;
  sign: SerializedMoneyWithSign['sign'];
}

function isSerializedMoneyWithSign(
  value: unknown,
): value is SerializedMoneyWithSign {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const money = record.money;

  return (
    typeof money === 'object' &&
    money !== null &&
    typeof (money as Record<string, unknown>).amount === 'number' &&
    typeof (money as Record<string, unknown>).currency === 'string' &&
    typeof record.sign === 'string'
  );
}

export function toMcpMoney(value: SerializedMoneyWithSign): McpMoney {
  const currency = value.money.currency;
  const decimals = getDecimalPlaces(currency);

  return {
    amount: Number(
      (value.money.amount / Math.pow(10, decimals)).toFixed(decimals),
    ),
    currency,
    sign: value.sign,
  };
}

export function normalizeMcpMoney(value: unknown): unknown {
  if (isSerializedMoneyWithSign(value)) {
    return toMcpMoney(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeMcpMoney(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeMcpMoney(nestedValue),
      ]),
    );
  }

  return value;
}
