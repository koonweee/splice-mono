import { minorToMajorString } from '../common/exact-money';
import {
  MoneyWithSignSchema,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';

export interface McpMoney {
  amount: string;
  currency: string;
  sign: SerializedMoneyWithSign['sign'];
}

export function toMcpMoney(value: SerializedMoneyWithSign): McpMoney {
  MoneyWithSignSchema.parse(value);
  return {
    amount: minorToMajorString(value.money.amount, value.money.currency),
    currency: value.money.currency,
    sign: value.sign,
  };
}

export function normalizeMcpMoney(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeMcpMoney(item));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (
      typeof record.money === 'object' &&
      record.money !== null &&
      'sign' in record
    ) {
      return toMcpMoney(MoneyWithSignSchema.parse(record));
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, nested]) => [
        key,
        normalizeMcpMoney(nested),
      ]),
    );
  }
  return value;
}
