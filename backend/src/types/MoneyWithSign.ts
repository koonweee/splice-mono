import { registerSchema } from 'src/common/zod-api-response';
import { z } from 'zod';
import {
  canonicalMinorUnits,
  ExactDecimal,
  formatExactDecimal,
  majorToMinorString,
  minorToMajorString,
  MINOR_UNIT_PATTERN,
  SIGNED_DECIMAL_PATTERN,
  SIGNED_MINOR_UNIT_PATTERN,
} from '../common/exact-money';
import { getDecimalPlaces } from '../common/currency-scales';
export { getDecimalPlaces } from '../common/currency-scales';

import { MoneySign } from '../common/money-sign';
export { MoneySign } from '../common/money-sign';

export const MinorUnitAmountSchema = z
  .string()
  .regex(
    MINOR_UNIT_PATTERN,
    'Use a nonnegative integer string of at most 78 digits in currency minor units',
  );
export const SignedMinorUnitAmountSchema = z
  .string()
  .regex(
    SIGNED_MINOR_UNIT_PATTERN,
    'Use an integer string of at most 78 digits in currency minor units',
  );

/** Exact major-unit decimal used by rule thresholds and provider-independent contracts. */
export const DecimalAmountSchema = z
  .string()
  .max(156)
  .regex(SIGNED_DECIMAL_PATTERN, 'Use decimal text without exponent notation');

export const MoneySchema = registerSchema(
  'Money',
  z.object({
    currency: z.string().min(1),
    /** Exact magnitude in smallest currency units, e.g. cents or wei. */
    amount: MinorUnitAmountSchema,
  }),
);
export const MoneySignSchema = z.nativeEnum(MoneySign);
export const MoneyWithSignSchema = registerSchema(
  'MoneyWithSign',
  z.object({ money: MoneySchema, sign: MoneySignSchema }),
);
export type SerializedMoney = z.infer<typeof MoneySchema>;
export type SerializedMoneyWithSign = z.infer<typeof MoneyWithSignSchema>;
export const CurrentAndAvailableBalanceSchema = z.object({
  availableBalance: MoneyWithSignSchema,
  currentBalance: MoneyWithSignSchema,
});

/** Exact integer magnitude and independent sign; JSON never contains a money number. */
export class MoneyWithSign {
  private readonly amount: string;

  constructor(
    private readonly currency: string,
    amount: string | bigint | number,
    private readonly sign: MoneySign,
  ) {
    this.amount = canonicalMinorUnits(amount);
    if (sign !== MoneySign.POSITIVE && sign !== MoneySign.NEGATIVE) {
      throw new RangeError('Invalid money sign');
    }
  }

  static fromMajorUnit(
    currency: string,
    amount: string,
    sign: MoneySign,
  ): MoneyWithSign {
    return new MoneyWithSign(
      currency,
      majorToMinorString(amount, currency),
      sign,
    );
  }

  /** Adapter for providers whose SDK already supplies a number; no recovery of lost provider digits. */
  static fromFloat(
    currency: string,
    amount: number,
    sign: MoneySign,
  ): MoneyWithSign {
    if (!Number.isFinite(amount))
      throw new RangeError('Provider amount must be finite');
    return MoneyWithSign.fromMajorUnit(
      currency,
      new ExactDecimal(String(amount)).toFixed(),
      sign,
    );
  }

  static fromSerialized(data: SerializedMoneyWithSign): MoneyWithSign {
    MoneyWithSignSchema.parse(data);
    return new MoneyWithSign(data.money.currency, data.money.amount, data.sign);
  }

  getAmount(): string {
    return this.amount;
  }
  toMinorUnits(): bigint {
    return BigInt(this.amount);
  }
  getCurrency(): string {
    return this.currency;
  }
  getSign(): MoneySign {
    return this.sign;
  }
  toMajorUnit(): string {
    return minorToMajorString(this.amount, this.currency);
  }

  toLocaleString(locale = 'en-US'): string {
    const isCrypto = ['ETH', 'BTC'].includes(this.currency.toUpperCase());
    if (!isCrypto) {
      return formatExactDecimal(this.toMajorUnit(), locale, {
        style: 'currency',
        currency: this.currency,
        minimumFractionDigits: getDecimalPlaces(this.currency),
        maximumFractionDigits: getDecimalPlaces(this.currency),
      });
    }
    return `${formatExactDecimal(this.toMajorUnit(), locale, {
      maximumFractionDigits: getDecimalPlaces(this.currency),
    })} ${this.currency}`;
  }

  toString(): string {
    return this.toLocaleString();
  }
  toSerialized(): SerializedMoneyWithSign {
    return {
      money: { currency: this.currency, amount: this.amount },
      sign: this.sign,
    };
  }
  toJSON(): SerializedMoneyWithSign {
    return this.toSerialized();
  }
}
