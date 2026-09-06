import { Column } from 'typeorm';
import {
  MoneyWithSign,
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';

/**
 * Embeddable class for balance columns.
 * Use with TypeORM's embedded column pattern to reuse balance fields across entities.
 *
 * Creates 3 columns when embedded:
 * - {prefix}Amount (numeric(78,0)) - Amount in smallest currency unit (e.g., cents)
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
  @Column({ type: 'numeric', precision: 78, scale: 0 })
  amount: string;

  /** ISO 4217 currency code (e.g., 'USD') */
  @Column({ type: 'varchar' })
  currency: string;

  /** Positive or negative sign */
  @Column({ type: 'varchar' })
  sign: MoneySign;

  /**
   * Create BalanceColumns from a SerializedMoneyWithSign (domain type)
   */
  static fromMoneyWithSign(data: SerializedMoneyWithSign): BalanceColumns {
    const canonical = MoneyWithSign.fromSerialized(data).toSerialized();
    const balance = new BalanceColumns();
    balance.amount = canonical.money.amount;
    balance.currency = canonical.money.currency;
    balance.sign = canonical.sign;
    return balance;
  }

  /**
   * Convert to SerializedMoneyWithSign (domain type)
   * Handles bigint columns that may be returned as strings by some DB drivers
   */
  toMoneyWithSign(): SerializedMoneyWithSign {
    return new MoneyWithSign(
      this.currency,
      this.amount,
      this.sign,
    ).toSerialized();
  }
}
