import { ISOCurrencyCode, Money } from '@half0wl/money';
import { registerSchema } from 'src/common/zod-api-response';
import { z } from 'zod';

export enum MoneySign {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
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
 * MoneyWithSign wrapper class over @half0wl/money
 *
 * Stores monetary amounts as integers in the smallest currency unit (e.g., cents)
 * while tracking credit/debit sign separately.
 *
 * @example
 * // Create from float (e.g., from Plaid API)
 * const balance = MoneyWithSign.fromFloat('USD', 199.99, MoneySign.POSITIVE);
 * balance.getAmount();     // => 19999 (cents)
 * balance.toLocaleString(); // => '$199.99'
 *
 * // Create from integer (e.g., from database)
 * const balance2 = new MoneyWithSign('USD', 19999, MoneySign.POSITIVE);
 */
export class MoneyWithSign {
  private readonly money: Money;
  private readonly sign: MoneySign;

  /**
   * Create a MoneyWithSign instance from integer amount (smallest currency unit)
   * @param currency - ISO 4217 currency code (e.g., 'USD')
   * @param amount - Amount in smallest currency unit (e.g., cents)
   * @param sign - Credit or debit
   */
  constructor(currency: ISOCurrencyCode, amount: number, sign: MoneySign) {
    this.money = new Money(currency, Math.abs(amount));
    this.sign = sign;
  }

  /**
   * Create a MoneyWithSign instance from a float amount
   * Useful for converting from external APIs (e.g., Plaid)
   * @param currency - ISO 4217 currency code (e.g., 'USD')
   * @param floatAmount - Amount as decimal (e.g., 199.99)
   * @param sign - Credit or debit
   */
  static fromFloat(
    currency: ISOCurrencyCode,
    floatAmount: number,
    sign: MoneySign,
  ): MoneyWithSign {
    const absAmount = Math.abs(floatAmount);

    // Money.fromFloat() throws for integers (including 0), so handle those directly
    // by converting to cents ourselves
    if (Number.isInteger(absAmount)) {
      const cents = absAmount * 100;
      return new MoneyWithSign(currency, cents, sign);
    }

    const money = Money.fromFloat(currency, absAmount);
    return new MoneyWithSign(currency, money.getAmount(), sign);
  }

  /**
   * Create a MoneyWithSign instance from serialized data (e.g., from database or DTO)
   */
  static fromSerialized(data: SerializedMoneyWithSign): MoneyWithSign {
    return new MoneyWithSign(
      data.money.currency as ISOCurrencyCode,
      data.money.amount,
      data.sign,
    );
  }

  /**
   * Get the amount in smallest currency unit (e.g., cents)
   */
  getAmount(): number {
    return this.money.getAmount();
  }

  /**
   * Get the currency code
   */
  getCurrency(): ISOCurrencyCode {
    return this.money.getCurrency();
  }

  /**
   * Get the sign (credit or debit)
   */
  getSign(): MoneySign {
    return this.sign;
  }

  /**
   * Get the underlying Money instance
   */
  getMoney(): Money {
    return this.money;
  }

  /**
   * Format as locale string (e.g., '$199.99')
   */
  toLocaleString(locale?: string): string {
    // Money class has proper toLocaleString implementation
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return this.money.toLocaleString(locale);
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
        currency: this.money.getCurrency(),
        amount: this.money.getAmount(),
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
