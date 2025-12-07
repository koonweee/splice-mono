import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AccountType } from 'plaid';
import { Between, Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import {
  AccountSummary,
  DashboardSummary,
  NetWorthChartPoint,
  TimePeriod,
} from '../types/Dashboard';

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

/** Convert cents to dollars */
const centsToDollars = (cents: number): number => cents / 100;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    @InjectRepository(BalanceSnapshotEntity)
    private readonly snapshotRepository: Repository<BalanceSnapshotEntity>,
  ) {}

  /**
   * Get dashboard summary including net worth, period-over-period changes, and account summaries
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

    const accounts = await this.accountRepository.find({
      where: { userId },
    });

    // Get snapshots from the specified period ago for comparison
    const today = new Date();
    const comparisonDate = new Date(today);
    comparisonDate.setDate(comparisonDate.getDate() - PERIOD_DAYS[period]);

    const previousSnapshots = await this.getSnapshotsNearDate(
      userId,
      comparisonDate,
    );

    // Build account summaries with period-over-period changes
    const assets: AccountSummary[] = [];
    const liabilities: AccountSummary[] = [];

    let currentNetWorth = 0;
    let previousNetWorth = 0;
    const defaultCurrency = 'USD';

    for (const account of accounts) {
      const currentBalance = this.getSignedBalance(account);
      const previousSnapshot = previousSnapshots.get(account.id);
      const previousBalance = previousSnapshot
        ? this.getSignedBalanceFromSnapshot(previousSnapshot)
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
        currentBalance: centsToDollars(
          Math.abs(Number(account.currentBalance.amount)),
        ),
        currency: account.currentBalance.currency || defaultCurrency,
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
        // Liabilities subtract from net worth (currentBalance is already signed)
        currentNetWorth += currentBalance;
        if (previousBalance !== null) {
          previousNetWorth += previousBalance;
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
    const chartData = await this.getChartData(userId, accounts, 6);

    return {
      netWorth: centsToDollars(currentNetWorth),
      currency: defaultCurrency,
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
   * Get the signed balance value from an account in cents
   * Returns positive for credit balances, negative for debit balances
   */
  private getSignedBalance(account: AccountEntity): number {
    const amount = Number(account.currentBalance.amount);
    return account.currentBalance.sign === 'debit' ? -amount : amount;
  }

  /**
   * Get the signed balance value from a snapshot in cents
   * Returns positive for credit balances, negative for debit balances
   */
  private getSignedBalanceFromSnapshot(
    snapshot: BalanceSnapshotEntity,
  ): number {
    const amount = Number(snapshot.currentBalance.amount);
    return snapshot.currentBalance.sign === 'debit' ? -amount : amount;
  }

  /**
   * Get snapshots closest to a target date for all accounts
   */
  private async getSnapshotsNearDate(
    userId: string,
    targetDate: Date,
  ): Promise<Map<string, BalanceSnapshotEntity>> {
    // Look for snapshots within a 7-day window around the target date
    const windowStart = new Date(targetDate);
    windowStart.setDate(windowStart.getDate() - 3);
    const windowEnd = new Date(targetDate);
    windowEnd.setDate(windowEnd.getDate() + 3);

    const snapshots = await this.snapshotRepository.find({
      where: {
        userId,
        snapshotDate: Between(
          windowStart.toISOString().split('T')[0],
          windowEnd.toISOString().split('T')[0],
        ),
      },
      order: { snapshotDate: 'DESC' },
    });

    // Group by accountId, keeping the closest to target date
    const result = new Map<string, BalanceSnapshotEntity>();
    const targetTime = targetDate.getTime();

    for (const snapshot of snapshots) {
      const existing = result.get(snapshot.accountId);
      if (!existing) {
        result.set(snapshot.accountId, snapshot);
      } else {
        // Keep the one closest to target date
        const existingDiff = Math.abs(
          new Date(existing.snapshotDate).getTime() - targetTime,
        );
        const currentDiff = Math.abs(
          new Date(snapshot.snapshotDate).getTime() - targetTime,
        );
        if (currentDiff < existingDiff) {
          result.set(snapshot.accountId, snapshot);
        }
      }
    }

    return result;
  }

  /**
   * Generate chart data points for net worth over time
   * @param userId - The user ID
   * @param accounts - Pre-fetched accounts for the user
   * @param months - Number of months of history to include
   */
  private async getChartData(
    userId: string,
    accounts: AccountEntity[],
    months: number,
  ): Promise<NetWorthChartPoint[]> {
    const points: NetWorthChartPoint[] = [];
    const today = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setMonth(date.getMonth() - i);
      date.setDate(1); // First of each month

      const snapshots = await this.getSnapshotsNearDate(userId, date);

      // If no snapshots exist for this date, return null value
      if (snapshots.size === 0) {
        points.push({
          date: date.toISOString().split('T')[0],
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
          const balance = this.getSignedBalanceFromSnapshot(snapshot);
          if (ASSET_TYPES.includes(account.type)) {
            netWorth += balance;
          } else if (LIABILITY_TYPES.includes(account.type)) {
            // Liabilities: balance is already signed, just add it
            netWorth += balance;
          }
        }
      }

      points.push({
        date: date.toISOString().split('T')[0],
        value: hasAnyData ? centsToDollars(netWorth) : null,
      });
    }

    return points;
  }
}
