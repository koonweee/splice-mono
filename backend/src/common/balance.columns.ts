import { Column } from 'typeorm';
import {
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';

/**
 * Embeddable class for balance columns.
 * Use with TypeORM's embedded column pattern to reuse balance fields across entities.
 *
 * Creates 3 columns when embedded:
 * - {prefix}Amount (bigint) - Amount in smallest currency unit (e.g., cents)
 * - {prefix}Currency (string) - ISO 4217 currency code
 * - {prefix}Sign (string) - 'positive' or 'negative'
 *
 * @example
 * // In your entity:
 * @Column(() => BalanceColumns)
 * availableBalance: BalanceColumns;
 *
 * @Column(() => BalanceColumns)
 * currentBalance: BalanceColumns;
 *
 * // Creates columns: availableBalanceAmount, availableBalanceCurrency, availableBalanceSign, etc.
 */
export class BalanceColumns {
  /** Amount in smallest currency unit (e.g., cents) */
  @Column({ type: 'bigint' })
  amount: number;

  /** ISO 4217 currency code (e.g., 'USD') */
  @Column()
  currency: string;

  /** Positive or negative sign */
  @Column()
  sign: MoneySign;

  /**
   * Create BalanceColumns from a SerializedMoneyWithSign (domain type)
   */
  static fromMoneyWithSign(data: SerializedMoneyWithSign): BalanceColumns {
    const balance = new BalanceColumns();
    balance.amount = data.money.amount;
    balance.currency = data.money.currency;
    balance.sign = data.sign;
    return balance;
  }

  /**
   * Convert to SerializedMoneyWithSign (domain type)
   * Handles bigint columns that may be returned as strings by some DB drivers
   */
  toMoneyWithSign(): SerializedMoneyWithSign {
    const amount =
      typeof this.amount === 'string' ? parseInt(this.amount, 10) : this.amount;

    return {
      money: {
        amount,
        currency: this.currency,
      },
      sign: this.sign,
    };
  }
}
