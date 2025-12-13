import { registerSchema } from 'src/common/zod-api-response';
import { z } from 'zod';

export enum MoneySign {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
}

/**
 * Decimal places for currencies (smallest unit conversion)
 * ISO-4217 fiat currencies + crypto currencies
 */
const CURRENCY_DECIMALS: Record<string, number> = {
  // Major fiat currencies (ISO-4217)
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
  // Zero-decimal currencies
  JPY: 0,
  KRW: 0,
  // Crypto currencies
  ETH: 18,
  BTC: 8,
};

/**
 * Get decimal places for a currency, defaulting to 2 for unknown currencies
 */
function getDecimalPlaces(currency: string): number {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

/**
 * Zod schema for serialized Money (stored as integer cents)
 */
export const MoneySchema = registerSchema(
  'Money',
  z.object({
    currency: z.string(),
    /** Amount in smallest currency unit (e.g., cents for USD) */
    amount: z.number().int(),
  }),
);

export const MoneySignSchema = z.nativeEnum(MoneySign);

/**
 * Zod schema for serialized MoneyWithSign
 */
export const MoneyWithSignSchema = registerSchema(
  'MoneyWithSign',
  z.object({
    money: MoneySchema,
    sign: MoneySignSchema,
  }),
);

/** Serialized Money type (for DTOs and storage) */
export type SerializedMoney = z.infer<typeof MoneySchema>;

/** Serialized MoneyWithSign type (for DTOs and storage) */
export type SerializedMoneyWithSign = z.infer<typeof MoneyWithSignSchema>;

/**
 * Schema for entities with both current and available balance fields.
 * Used by Account and BalanceSnapshot.
 */
export const CurrentAndAvailableBalanceSchema = z.object({
  availableBalance: MoneyWithSignSchema,
  currentBalance: MoneyWithSignSchema,
});

/**
 * MoneyWithSign class for handling monetary amounts with sign tracking
 *
 * Stores monetary amounts as integers in the smallest currency unit (e.g., cents)
 * while tracking credit/debit sign separately. Supports both fiat (ISO-4217)
 * and crypto currencies.
 *
 * @example
 * // Create from float (e.g., from Plaid API)
 * const balance = MoneyWithSign.fromFloat('USD', 199.99, MoneySign.POSITIVE);
 * balance.getAmount();     // => 19999 (cents)
 * balance.toLocaleString(); // => '$199.99'
 *
 * // Create from integer (e.g., from database)
 * const balance2 = new MoneyWithSign('USD', 19999, MoneySign.POSITIVE);
 *
 * // Crypto currencies work too
 * const eth = MoneyWithSign.fromFloat('ETH', 1.5, MoneySign.POSITIVE);
 * eth.getAmount(); // => 1500000000000000000 (wei)
 */
export class MoneyWithSign {
  private readonly currency: string;
  private readonly amount: number;
  private readonly sign: MoneySign;

  /**
   * Create a MoneyWithSign instance from integer amount (smallest currency unit)
   * @param currency - Currency code (e.g., 'USD', 'ETH')
   * @param amount - Amount in smallest currency unit (e.g., cents, wei)
   * @param sign - Credit or debit
   */
  constructor(currency: string, amount: number, sign: MoneySign) {
    this.currency = currency;
    this.amount = Math.abs(Math.round(amount));
    this.sign = sign;
  }

  /**
   * Create a MoneyWithSign instance from a float amount
   * Useful for converting from external APIs (e.g., Plaid, Tatum)
   * @param currency - Currency code (e.g., 'USD', 'ETH')
   * @param floatAmount - Amount as decimal (e.g., 199.99)
   * @param sign - Credit or debit
   */
  static fromFloat(
    currency: string,
    floatAmount: number,
    sign: MoneySign,
  ): MoneyWithSign {
    const decimals = getDecimalPlaces(currency);
    const smallestUnit = Math.round(
      Math.abs(floatAmount) * Math.pow(10, decimals),
    );
    return new MoneyWithSign(currency, smallestUnit, sign);
  }

  /**
   * Create a MoneyWithSign instance from serialized data (e.g., from database or DTO)
   */
  static fromSerialized(data: SerializedMoneyWithSign): MoneyWithSign {
    return new MoneyWithSign(data.money.currency, data.money.amount, data.sign);
  }

  /**
   * Get the amount in smallest currency unit (e.g., cents)
   */
  getAmount(): number {
    return this.amount;
  }

  /**
   * Get the currency code
   */
  getCurrency(): string {
    return this.currency;
  }

  /**
   * Get the sign (credit or debit)
   */
  getSign(): MoneySign {
    return this.sign;
  }

  /**
   * Get the amount in major currency unit (e.g., dollars, ETH)
   */
  toMajorUnit(): number {
    const decimals = getDecimalPlaces(this.currency);
    return this.amount / Math.pow(10, decimals);
  }

  /**
   * Format as locale string (e.g., '$199.99')
   * For crypto currencies, formats as number with currency code suffix
   */
  toLocaleString(locale = 'en-US'): string {
    const floatValue = this.toMajorUnit();

    // Check if this is a known fiat currency for Intl.NumberFormat
    const isFiat = [
      'USD',
      'EUR',
      'GBP',
      'CAD',
      'AUD',
      'CHF',
      'CNY',
      'INR',
      'MXN',
      'BRL',
      'JPY',
      'KRW',
    ].includes(this.currency);

    if (isFiat) {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: this.currency,
      }).format(floatValue);
    }

    // For crypto, format as number with currency suffix
    return `${floatValue.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} ${this.currency}`;
  }

  /**
   * Convert to string (delegates to toLocaleString)
   * Enables use in template literals and string concatenation
   */
  toString(): string {
    return this.toLocaleString();
  }

  /**
   * Serialize to plain object for storage/DTOs
   */
  toSerialized(): SerializedMoneyWithSign {
    return {
      money: {
        currency: this.currency,
        amount: this.amount,
      },
      sign: this.sign,
    };
  }

  /**
   * Serialize to JSON (returns plain object, not the Money instance)
   */
  toJSON(): SerializedMoneyWithSign {
    return this.toSerialized();
  }
}
