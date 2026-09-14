import type {
  AccountBalanceResult,
  BalanceQueryPerDateResult,
} from '../types/BalanceQuery';
import {
  moneyFromSignedMinorUnits,
  signedMinorUnits,
} from '../common/exact-money';
import {
  calculateNetWorthForDate,
  netWorthContribution,
  isLiabilityType,
} from './balance-projection';

/** Evidence for the selected historical balance, independent of current account metadata. */
export function balanceEndpoint(result: AccountBalanceResult, date: string) {
  return {
    date,
    nativeBalance: result.effectiveBalance.balance,
    reportingBalance:
      result.effectiveBalance.reportingBalance ??
      result.effectiveBalance.convertedBalance ??
      result.effectiveBalance.balance,
    netWorthContribution: moneyFromSignedMinorUnits(
      netWorthContribution(result),
      (
        result.effectiveBalance.reportingBalance ??
        result.effectiveBalance.convertedBalance ??
        result.effectiveBalance.balance
      ).money.currency,
    ),
    provenance: result.provenance ?? null,
    exchangeRate: result.effectiveBalance.exchangeRate ?? null,
    latestAccountSyncAt: result.latestSyncedAt?.toISOString() ?? null,
  };
}

/** Observed endpoint changes; no inference of trading, spending, or market P&L. */
export function buildBalanceAttribution(
  opening: BalanceQueryPerDateResult,
  closing: BalanceQueryPerDateResult,
  reportingCurrency: string,
) {
  const openingTotal = calculateNetWorthForDate(opening.balances);
  const closingTotal = calculateNetWorthForDate(closing.balances);
  const accounts = Object.entries(closing.balances).map(([accountId, last]) => {
    const first = opening.balances[accountId];
    // Both endpoints are produced from the same owned account set/database view.
    if (!first)
      throw new Error('Balance attribution endpoint account sets differ');
    const nativeFirst = first.effectiveBalance.balance;
    const nativeLast = last.effectiveBalance.balance;
    const contribution =
      netWorthContribution(last) - netWorthContribution(first);
    return {
      accountId,
      accountName: last.account.customName ?? last.account.name,
      type: last.account.type,
      isLiability: isLiabilityType(last.account.type),
      opening: balanceEndpoint(first, opening.date),
      closing: balanceEndpoint(last, closing.date),
      nativeBalanceChange:
        nativeFirst.money.currency === nativeLast.money.currency
          ? moneyFromSignedMinorUnits(
              signedMinorUnits(nativeLast) - signedMinorUnits(nativeFirst),
              nativeLast.money.currency,
            )
          : null,
      contribution: moneyFromSignedMinorUnits(contribution, reportingCurrency),
    };
  });
  accounts.sort((a, b) => {
    const magnitude = (value: typeof a) => {
      const minor = signedMinorUnits(value.contribution);
      return minor < 0n ? -minor : minor;
    };
    const left = magnitude(a),
      right = magnitude(b);
    return left === right
      ? a.accountId.localeCompare(b.accountId)
      : left > right
        ? -1
        : 1;
  });
  const sum = accounts.reduce(
    (total, account) => total + signedMinorUnits(account.contribution),
    0n,
  );
  const change = closingTotal - openingTotal;
  const missing = accounts.some(
    (account) =>
      account.opening.provenance?.coverage === 'missing' ||
      account.closing.provenance?.coverage === 'missing',
  );
  return {
    basis: 'recorded_balance_change' as const,
    reportingCurrency,
    startDate: opening.date,
    endDate: closing.date,
    coverage:
      accounts.length === 0
        ? ('no_accounts' as const)
        : missing
          ? ('missing_snapshots' as const)
          : ('complete' as const),
    openingNetWorth: moneyFromSignedMinorUnits(openingTotal, reportingCurrency),
    closingNetWorth: moneyFromSignedMinorUnits(closingTotal, reportingCurrency),
    change: moneyFromSignedMinorUnits(change, reportingCurrency),
    accounts: accounts.map((account, index) => ({
      rank: index + 1,
      ...account,
    })),
    reconciliation: {
      contributionTotal: moneyFromSignedMinorUnits(sum, reportingCurrency),
      residual: moneyFromSignedMinorUnits(change - sum, reportingCurrency),
      exact: change === sum,
    },
    limitations: [
      'Recorded balances include native balance changes and reporting FX effects; these are not market P&L or spending attribution.',
      'Missing snapshots contribute zero under chart semantics, not a known zero valuation.',
      'Account classification and metadata reflect the current owned account set; snapshot update time is recording time, not a separate market price timestamp.',
    ],
  };
}
