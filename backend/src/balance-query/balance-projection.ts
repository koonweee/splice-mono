import { ServiceUnavailableException } from '@nestjs/common';
import { AccountType } from 'plaid';
import type { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import type {
  AccountBalanceResult,
  BalanceWithConvertedBalance,
  RateWithSource,
} from '../types/BalanceQuery';
import {
  getDecimalPlaces,
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';

/** Call with monotonically increasing dates for each account. */
export function createSnapshotCursor(snapshots: BalanceSnapshotEntity[]) {
  const byAccount = new Map<string, BalanceSnapshotEntity[]>();
  for (const snapshot of snapshots) {
    const values = byAccount.get(snapshot.accountId) ?? [];
    values.push(snapshot);
    byAccount.set(snapshot.accountId, values);
  }
  for (const values of byAccount.values())
    values.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  const positions = new Map<string, number>();
  return (
    accountId: string,
    date: string,
  ): BalanceSnapshotEntity | undefined => {
    const values = byAccount.get(accountId) ?? [];
    let position = positions.get(accountId) ?? -1;
    while (
      position + 1 < values.length &&
      values[position + 1].snapshotDate <= date
    )
      position++;
    positions.set(accountId, position);
    return values[position];
  };
}

export function buildBalanceWithConversion(
  balance: SerializedMoneyWithSign,
  targetCurrency: string | undefined,
  dateRates: Map<string, RateWithSource> | undefined,
  targetDate: string,
): BalanceWithConvertedBalance {
  const result: BalanceWithConvertedBalance = { balance };
  if (!targetCurrency || balance.money.currency === targetCurrency)
    return result;
  if (balance.money.amount === 0) {
    result.convertedBalance = {
      money: { amount: 0, currency: targetCurrency },
      sign: balance.sign,
    };
    return result;
  }
  const rateInfo = dateRates?.get(
    `${balance.money.currency}:${targetCurrency}`,
  );
  if (!rateInfo || !Number.isFinite(rateInfo.rate) || rateInfo.rate <= 0) {
    throw new ServiceUnavailableException(
      `Required exchange rate is unavailable for ${balance.money.currency} to ${targetCurrency} on ${targetDate}`,
    );
  }
  const major =
    balance.money.amount /
    Math.pow(10, getDecimalPlaces(balance.money.currency));
  result.convertedBalance = {
    money: {
      amount: Math.round(
        major * rateInfo.rate * Math.pow(10, getDecimalPlaces(targetCurrency)),
      ),
      currency: targetCurrency,
    },
    sign: balance.sign,
  };
  result.exchangeRate = rateInfo;
  return result;
}

export function isLiabilityType(type: string): boolean {
  return (
    type === String(AccountType.Credit) || type === String(AccountType.Loan)
  );
}

export function getSignedAmount(balance: SerializedMoneyWithSign): number {
  const major =
    balance.money.amount /
    Math.pow(10, getDecimalPlaces(balance.money.currency));
  return balance.sign === MoneySign.NEGATIVE ? -major : major;
}

export function calculateChangePercent(
  current: number,
  previous: number,
): number | undefined {
  return previous === 0
    ? undefined
    : ((current - previous) / Math.abs(previous)) * 100;
}

export function createMoneyWithSign(
  amount: number,
  currency: string,
): SerializedMoneyWithSign {
  return {
    money: {
      amount: Math.round(
        Math.abs(amount) * Math.pow(10, getDecimalPlaces(currency)),
      ),
      currency,
    },
    sign: amount < 0 ? MoneySign.NEGATIVE : MoneySign.POSITIVE,
  };
}

export function calculateNetWorthForDate(
  balances: Record<string, AccountBalanceResult>,
): number {
  let currency: string | undefined;
  let total = 0;
  for (const result of Object.values(balances)) {
    const effective =
      result.effectiveBalance.convertedBalance ??
      result.effectiveBalance.balance;
    if (effective.money.amount !== 0) {
      if (currency && currency !== effective.money.currency) {
        throw new ServiceUnavailableException(
          'Balance conversion is incomplete; retry after exchange rates are available',
        );
      }
      currency = effective.money.currency;
    }
    const amount = getSignedAmount(effective);
    total += isLiabilityType(result.account.type) ? -Math.abs(amount) : amount;
  }
  return total;
}
