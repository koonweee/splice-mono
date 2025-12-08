import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { AccountType } from 'plaid';
import { AccountService } from '../account/account.service';
import { BalanceSnapshotService } from '../balance-snapshot/balance-snapshot.service';
import { AccountWithConvertedBalance } from '../types/Account';
import { BalanceSnapshotWithConvertedBalance } from '../types/BalanceSnapshot';
import {
  AccountSummary,
  DashboardSummary,
  NetWorthChartPoint,
  TimePeriod,
} from '../types/Dashboard';
import {
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';
import { UserService } from '../user/user.service';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Account types that contribute positively to net worth */
const ASSET_TYPES: string[] = [
  AccountType.Depository,
  AccountType.Investment,
  AccountType.Brokerage,
  AccountType.Other,
];

/** Account types that contribute negatively to net worth */
const LIABILITY_TYPES: string[] = [AccountType.Credit, AccountType.Loan];

/** Number of days to look back for each time period */
const PERIOD_DAYS: Record<TimePeriod, number> = {
  [TimePeriod.DAY]: 1,
  [TimePeriod.WEEK]: 7,
  [TimePeriod.MONTH]: 30,
  [TimePeriod.YEAR]: 365,
};

/** Create a SerializedMoneyWithSign from cents amount */
const createMoneyWithSign = (
  cents: number,
  currency: string,
): SerializedMoneyWithSign => ({
  money: {
    amount: Math.abs(cents),
    currency,
  },
  sign: cents >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE,
});

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly balanceSnapshotService: BalanceSnapshotService,
    private readonly userService: UserService,
  ) {}

  /**
   * Get dashboard summary including net worth, period-over-period changes, and account summaries
   * All balances are converted to the user's preferred currency
   * @param userId - The user ID to get the dashboard for
   * @param period - The time period for comparison (defaults to MONTH)
   */
  async getSummary(
    userId: string,
    period: TimePeriod = TimePeriod.MONTH,
  ): Promise<DashboardSummary> {
    this.logger.log(
      `Getting dashboard summary for userId=${userId}, period=${period}`,
    );

    // Get accounts with converted balances
    const accounts = await this.accountService.findAllWithConversion(userId);

    if (accounts.length === 0) {
      return {
        netWorth: createMoneyWithSign(0, 'USD'),
        changePercent: null,
        comparisonPeriod: period,
        chartData: [],
        assets: [],
        liabilities: [],
      };
    }

    // Get the target currency from the first account's converted balance
    // All accounts are converted to the same currency
    const targetCurrency =
      accounts[0].convertedCurrentBalance?.money.currency ?? 'USD';

    // Get user's timezone for date calculations
    const userTimezone = await this.userService.getTimezone(userId);

    // Get snapshots from the specified period ago for comparison
    const comparisonDate = dayjs()
      .tz(userTimezone)
      .startOf('day')
      .subtract(PERIOD_DAYS[period], 'day')
      .toDate();

    const previousSnapshots =
      await this.balanceSnapshotService.findSnapshotsNearDateWithConversion(
        userId,
        comparisonDate,
      );

    // Build account summaries with period-over-period changes
    const assets: AccountSummary[] = [];
    const liabilities: AccountSummary[] = [];

    let currentNetWorth = 0;
    let previousNetWorth = 0;

    for (const account of accounts) {
      const currentBalance = this.getSignedConvertedBalance(account);
      const previousSnapshot = previousSnapshots.get(account.id);
      const previousBalance = previousSnapshot
        ? this.getSignedConvertedBalanceFromSnapshot(previousSnapshot)
        : null;

      const changePercent =
        previousBalance !== null && previousBalance !== 0
          ? ((currentBalance - previousBalance) / Math.abs(previousBalance)) *
            100
          : null;

      const summary: AccountSummary = {
        id: account.id,
        name: account.name,
        type: account.type as AccountType,
        subType: account.subType,
        currentBalance: account.currentBalance,
        convertedCurrentBalance: account.convertedCurrentBalance,
        changePercent:
          changePercent !== null ? Math.round(changePercent * 10) / 10 : null,
      };

      if (ASSET_TYPES.includes(account.type)) {
        assets.push(summary);
        currentNetWorth += currentBalance;
        if (previousBalance !== null) {
          previousNetWorth += previousBalance;
        }
      } else if (LIABILITY_TYPES.includes(account.type)) {
        liabilities.push(summary);
        // Liabilities subtract from net worth - negate the balance
        currentNetWorth -= Math.abs(currentBalance);
        if (previousBalance !== null) {
          previousNetWorth -= Math.abs(previousBalance);
        }
      }
    }

    // Calculate net worth period-over-period change
    const netWorthChangePercent =
      previousNetWorth !== 0
        ? ((currentNetWorth - previousNetWorth) / Math.abs(previousNetWorth)) *
          100
        : null;

    // Generate chart data (monthly points for last 6 months)
    const chartData = await this.getChartData(
      userId,
      accounts,
      6,
      userTimezone,
    );

    return {
      netWorth: createMoneyWithSign(currentNetWorth, targetCurrency),
      changePercent:
        netWorthChangePercent !== null
          ? Math.round(netWorthChangePercent * 10) / 10
          : null,
      comparisonPeriod: period,
      chartData,
      assets,
      liabilities,
    };
  }

  /**
   * Get the signed converted balance value from an account in cents
   * Uses converted balance if available, falls back to original balance
   * Returns positive for credit balances, negative for debit balances
   */
  private getSignedConvertedBalance(
    account: AccountWithConvertedBalance,
  ): number {
    const balance = account.convertedCurrentBalance ?? account.currentBalance;
    const amount = balance.money.amount;
    return balance.sign === MoneySign.NEGATIVE ? -amount : amount;
  }

  /**
   * Get the signed converted balance value from a snapshot in cents
   * Uses converted balance if available, falls back to original balance
   * Returns positive for credit balances, negative for debit balances
   */
  private getSignedConvertedBalanceFromSnapshot(
    snapshot: BalanceSnapshotWithConvertedBalance,
  ): number {
    const balance = snapshot.convertedCurrentBalance ?? snapshot.currentBalance;
    const amount = balance.money.amount;
    return balance.sign === MoneySign.NEGATIVE ? -amount : amount;
  }

  /**
   * Generate chart data points for net worth over time
   * All values are in the user's preferred currency
   * @param userId - The user ID
   * @param accounts - Pre-fetched accounts with converted balances
   * @param months - Number of months of history to include
   * @param userTimezone - User's IANA timezone string
   */
  private async getChartData(
    userId: string,
    accounts: AccountWithConvertedBalance[],
    months: number,
    userTimezone: string,
  ): Promise<NetWorthChartPoint[]> {
    const points: NetWorthChartPoint[] = [];
    const today = dayjs().tz(userTimezone);

    // Get the target currency from accounts
    const targetCurrency =
      accounts[0]?.convertedCurrentBalance?.money.currency ?? 'USD';

    for (let i = months - 1; i >= 0; i--) {
      const date = today.subtract(i, 'month').startOf('month');

      const snapshots =
        await this.balanceSnapshotService.findSnapshotsNearDateWithConversion(
          userId,
          date.toDate(),
        );

      // If no snapshots exist for this date, return null value
      if (snapshots.size === 0) {
        points.push({
          date: date.format('YYYY-MM-DD'),
          value: null,
        });
        continue;
      }

      let netWorth = 0;
      let hasAnyData = false;

      for (const account of accounts) {
        const snapshot = snapshots.get(account.id);
        if (snapshot) {
          hasAnyData = true;
          const balance = this.getSignedConvertedBalanceFromSnapshot(snapshot);
          if (ASSET_TYPES.includes(account.type)) {
            netWorth += balance;
          } else if (LIABILITY_TYPES.includes(account.type)) {
            // Liabilities subtract from net worth - negate the balance
            netWorth -= Math.abs(balance);
          }
        }
      }

      points.push({
        date: date.format('YYYY-MM-DD'),
        value: hasAnyData
          ? createMoneyWithSign(netWorth, targetCurrency)
          : null,
      });
    }

    return points;
  }
}
