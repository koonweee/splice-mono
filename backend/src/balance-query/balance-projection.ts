import {
  compareMinorUnits,
  convertMinorUnits,
  ExactDecimal,
  moneyFromSignedMinorUnits,
  moneyRatio,
  signedMinorUnits,
} from '../common/exact-money';
import { ServiceUnavailableException } from '@nestjs/common';
import { AccountType } from 'plaid';
import type { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import type {
  AccountBalanceResult,
  BalanceWithConvertedBalance,
  RateWithSource,
} from '../types/BalanceQuery';
import { type SerializedMoneyWithSign } from '../types/MoneyWithSign';

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

interface ConversionReuse {
  validatedRates: WeakSet<RateWithSource>;
  amounts: WeakMap<
    SerializedMoneyWithSign,
    { numerator: string; denominator: string; amount: string }
  >;
}

/** Request-local only: retain the last ratio per active native balance, never daily results. */
export function createBalanceConverter(targetCurrency: string) {
  const reuse: ConversionReuse = {
    validatedRates: new WeakSet(),
    amounts: new WeakMap(),
  };
  return (
    balance: SerializedMoneyWithSign,
    dateRates: Map<string, RateWithSource> | undefined,
    targetDate: string,
  ) =>
    buildBalanceWithConversion(
      balance,
      targetCurrency,
      dateRates,
      targetDate,
      reuse,
    );
}

export function buildBalanceWithConversion(
  balance: SerializedMoneyWithSign,
  targetCurrency: string | undefined,
  dateRates: Map<string, RateWithSource> | undefined,
  targetDate: string,
  reuse?: ConversionReuse,
): BalanceWithConvertedBalance {
  // Cached native objects stay private, so mutating one returned day cannot affect another.
  const result: BalanceWithConvertedBalance = {
    balance: reuse
      ? { money: { ...balance.money }, sign: balance.sign }
      : balance,
  };
  if (!targetCurrency || balance.money.currency === targetCurrency)
    return result;
  if (balance.money.amount === '0') {
    result.convertedBalance = {
      money: { amount: '0', currency: targetCurrency },
      sign: balance.sign,
    };
    return result;
  }
  const rateInfo = dateRates?.get(
    `${balance.money.currency}:${targetCurrency}`,
  );
  if (
    !rateInfo ||
    (!reuse?.validatedRates.has(rateInfo) &&
      !new ExactDecimal(rateInfo.rate).gt(0))
  ) {
    throw new ServiceUnavailableException(
      `Required exchange rate is unavailable for ${balance.money.currency} to ${targetCurrency} on ${targetDate}`,
    );
  }
  reuse?.validatedRates.add(rateInfo);
  const previous = reuse?.amounts.get(balance);
  const { numerator, denominator } = rateInfo.ratio;
  const amount =
    previous?.numerator === numerator && previous.denominator === denominator
      ? previous.amount
      : convertMinorUnits(
          balance.money.amount,
          balance.money.currency,
          targetCurrency,
          rateInfo.ratio,
        );
  if (previous?.numerator !== numerator || previous.denominator !== denominator)
    reuse?.amounts.set(balance, { numerator, denominator, amount });
  result.convertedBalance = {
    money: { amount, currency: targetCurrency },
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

/** Signed minor units; all balance projection arithmetic shares the reporting currency. */
export function getSignedAmount(balance: SerializedMoneyWithSign): bigint {
  return signedMinorUnits(balance);
}

export function calculateChangePercent(
  current: bigint,
  previous: bigint,
): number | undefined {
  return previous === 0n
    ? undefined
    : moneyRatio(current - previous, previous < 0n ? -previous : previous) *
        100;
}

export const createMoneyWithSign = moneyFromSignedMinorUnits;
export const compareBalanceAmounts = compareMinorUnits;

export function calculateNetWorthForDate(
  balances: Record<string, AccountBalanceResult>,
): bigint {
  let currency: string | undefined;
  let total = 0n;
  for (const result of Object.values(balances)) {
    const effective =
      result.effectiveBalance.convertedBalance ??
      result.effectiveBalance.balance;
    if (effective.money.amount !== '0') {
      if (currency && currency !== effective.money.currency) {
        throw new ServiceUnavailableException(
          'Balance conversion is incomplete; retry after exchange rates are available',
        );
      }
      currency = effective.money.currency;
    }
    const amount = getSignedAmount(effective);
    total += isLiabilityType(result.account.type)
      ? amount < 0n
        ? amount
        : -amount
      : amount;
  }
  return total;
}
