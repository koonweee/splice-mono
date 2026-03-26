import { AccountType } from 'plaid';
import {
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';

export function getSignedMoneyAmount(balance: SerializedMoneyWithSign): number {
  return balance.sign === MoneySign.POSITIVE
    ? balance.money.amount
    : -balance.money.amount;
}

export function calculateEffectiveBalance(
  accountType: string | null | undefined,
  availableBalance: SerializedMoneyWithSign,
  currentBalance: SerializedMoneyWithSign,
): SerializedMoneyWithSign {
  if (
    accountType === AccountType.Investment ||
    accountType === AccountType.Brokerage
  ) {
    const totalAmount =
      getSignedMoneyAmount(availableBalance) +
      getSignedMoneyAmount(currentBalance);

    return {
      money: {
        amount: Math.abs(totalAmount),
        currency: availableBalance.money.currency,
      },
      sign: totalAmount >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE,
    };
  }

  return currentBalance;
}
