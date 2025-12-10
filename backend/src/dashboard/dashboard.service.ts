import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { AccountType } from 'plaid';
import { AccountService } from '../account/account.service';
import { BalanceSnapshotService } from '../balance-snapshot/balance-snapshot.service';
import { Account } from '../types/Account';
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
   * Uses latest snapshots for current balances to ensure consistency with historical data
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

    // Get accounts for metadata (name, type, institution, etc.)
    const accounts = await this.accountService.findAll(userId);

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

    // Get user's timezone for date calculations
    const userTimezone = await this.userService.getTimezone(userId);

    // Get today's date in user's timezone for current snapshots
    const today = dayjs().tz(userTimezone).startOf('day');
    const todayDate = today.format('YYYY-MM-DD');

    // Get latest snapshots (today's snapshots) for current balances
    // Fall back to yesterday if no snapshots exist for today yet
    let currentSnapshots =
      await this.balanceSnapshotService.findSnapshotsForDateWithConversion(
        userId,
        todayDate,
      );

    if (currentSnapshots.size === 0) {
      const yesterdayDate = today.subtract(1, 'day').format('YYYY-MM-DD');
      currentSnapshots =
        await this.balanceSnapshotService.findSnapshotsForDateWithConversion(
          userId,
          yesterdayDate,
        );
    }

    // Get the target currency from the first snapshot's converted balance
    // All snapshots are converted to the same currency
    const firstSnapshot = Array.from(currentSnapshots.values())[0];
    const targetCurrency =
      firstSnapshot?.convertedCurrentBalance?.balance.money.currency ?? 'USD';

    // Get snapshots from the specified period ago for comparison
    const comparisonDate = dayjs()
      .tz(userTimezone)
      .startOf('day')
      .subtract(PERIOD_DAYS[period], 'day')
      .format('YYYY-MM-DD');

    const previousSnapshots =
      await this.balanceSnapshotService.findSnapshotsForDateWithConversion(
        userId,
        comparisonDate,
      );

    // Build account summaries with period-over-period changes
    const assets: AccountSummary[] = [];
    const liabilities: AccountSummary[] = [];

    let currentNetWorth = 0;
    let previousNetWorth = 0;

    for (const account of accounts) {
      const currentSnapshot = currentSnapshots.get(account.id);

      // Skip accounts without a current snapshot
      if (!currentSnapshot) {
        this.logger.debug(
          `No current snapshot found for account ${account.id}, skipping`,
        );
        continue;
      }

      const currentBalance =
        this.getSignedConvertedBalanceFromSnapshot(currentSnapshot);
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
        currentBalance: currentSnapshot.currentBalance,
        convertedCurrentBalance: currentSnapshot.convertedCurrentBalance,
        effectiveBalance: currentSnapshot.effectiveBalance,
        convertedEffectiveBalance: currentSnapshot.convertedEffectiveBalance,
        changePercent:
          changePercent !== null ? Math.round(changePercent * 10) / 10 : null,
        institutionName: account.institutionName ?? null,
      };

      if (account.id === '0b16fa48-7de7-4a77-8b76-f067b54e34c4') {
        this.logger.debug(summary);
      }

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

    // Generate chart data based on selected time period
    const chartData = await this.getChartData(
      userId,
      accounts,
      targetCurrency,
      period,
      userTimezone,
    );

    // Sort account summaries by effective balance descending (highest first)
    const sortByBalance = (a: AccountSummary, b: AccountSummary) => {
      const balanceA = a.convertedEffectiveBalance?.balance.money.amount ?? 0;
      const balanceB = b.convertedEffectiveBalance?.balance.money.amount ?? 0;
      return balanceB - balanceA;
    };

    assets.sort(sortByBalance);
    liabilities.sort(sortByBalance);

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
   * Get the signed effective balance value from a snapshot in cents
   * Uses converted effective balance if available, falls back to original effective balance
   * Returns positive for credit balances, negative for debit balances
   */
  private getSignedConvertedBalanceFromSnapshot(
    snapshot: BalanceSnapshotWithConvertedBalance,
  ): number {
    const convertedBalance = snapshot.convertedEffectiveBalance;
    if (convertedBalance) {
      const amount = convertedBalance.balance.money.amount;
      return convertedBalance.balance.sign === MoneySign.NEGATIVE
        ? -amount
        : amount;
    }
    // Fallback to original effective balance
    const amount = snapshot.effectiveBalance.money.amount;
    return snapshot.effectiveBalance.sign === MoneySign.NEGATIVE
      ? -amount
      : amount;
  }

  /**
   * Generate chart data points for net worth over time
   * Shows daily data points for the entire period (matching the comparison period)
   * All values are in the user's preferred currency
   * @param userId - The user ID
   * @param accounts - Pre-fetched accounts with converted balances
   * @param period - The time period (determines how many days of data to show)
   * @param userTimezone - User's IANA timezone string
   */
  private async getChartData(
    userId: string,
    accounts: Account[],
    targetCurrency: string,
    period: TimePeriod,
    userTimezone: string,
  ): Promise<NetWorthChartPoint[]> {
    const points: NetWorthChartPoint[] = [];
    const today = dayjs().tz(userTimezone).startOf('day');

    console.log('getting chart data starting at', today.format('YYYY-MM-DD'));

    // Get the number of days for this period
    const daysToShow = PERIOD_DAYS[period];

    // Build daily dates from oldest to newest
    const dates: dayjs.Dayjs[] = [];
    for (let i = daysToShow; i >= 0; i--) {
      dates.push(today.subtract(i, 'day'));
    }

    // Find the first date (oldest) that has data
    let startIndex = 0;
    for (let i = 0; i < dates.length; i++) {
      const snapshotDate = dates[i].format('YYYY-MM-DD');
      const snapshots =
        await this.balanceSnapshotService.findSnapshotsForDateWithConversion(
          userId,
          snapshotDate,
        );
      if (snapshots.size > 0) {
        startIndex = i;
        break;
      }
      // If we've checked all dates and found no data, return empty
      if (i === dates.length - 1) {
        return [];
      }
    }

    // Generate points from startIndex onwards
    for (let i = startIndex; i < dates.length; i++) {
      const date = dates[i];
      const snapshotDate = date.format('YYYY-MM-DD');

      const snapshots =
        await this.balanceSnapshotService.findSnapshotsForDateWithConversion(
          userId,
          snapshotDate,
        );

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
