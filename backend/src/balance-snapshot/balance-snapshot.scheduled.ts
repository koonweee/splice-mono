import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotType } from '../types/BalanceSnapshot';
import { UserService } from '../user/user.service';
import { BalanceSnapshotService } from './balance-snapshot.service';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Scheduled service for balance snapshot operations.
 * Ensures all accounts have daily balance snapshots by forward-filling
 * from the previous day's snapshot when missing.
 */
@Injectable()
export class BalanceSnapshotScheduledService {
  private readonly logger = new Logger(BalanceSnapshotScheduledService.name);

  constructor(
    private readonly balanceSnapshotService: BalanceSnapshotService,
    private readonly userService: UserService,
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
  ) {}

  /**
   * Forward-fill missing balance snapshots every 6 hours.
   * Checks if all accounts have snapshots for the previous day (in user's timezone).
   * If not, creates one by copying from the most recent preceding snapshot.
   *
   * Runs every 6 hours to ensure timely coverage for users in all timezones.
   */
  @Cron('0 0 */6 * * *', {
    name: 'forwardFillBalanceSnapshots',
  })
  async handleForwardFillSnapshots(): Promise<void> {
    this.logger.log('Starting scheduled forward-fill of balance snapshots');

    try {
      const result = await this.forwardFillMissingSnapshots();
      this.logger.log(
        `Scheduled forward-fill completed: ${result.created} snapshots created, ${result.skipped} accounts skipped (no prior snapshot)`,
      );
    } catch (error) {
      this.logger.error(`Scheduled forward-fill failed: ${error}`);
    }
  }

  /**
   * Forward-fill missing balance snapshots for all accounts.
   * For each account without a snapshot for the target date (yesterday in user's timezone),
   * copies the most recent preceding snapshot.
   *
   * @returns Statistics about the operation
   */
  async forwardFillMissingSnapshots(): Promise<{
    created: number;
    skipped: number;
  }> {
    this.logger.log('Forward-filling snapshots for all accounts');

    // Get all accounts (system-wide operation)
    const accounts = await this.accountRepository.find();
    this.logger.log(`Found ${accounts.length} accounts to check`);

    let created = 0;
    let skipped = 0;

    for (const account of accounts) {
      try {
        // Get yesterday's date in the user's timezone
        const userTimezone = await this.userService.getTimezone(account.userId);
        const yesterday = this.getYesterdayDateString(userTimezone);

        const wasCreated = await this.forwardFillForAccount(
          account.id,
          account.userId,
          yesterday,
        );
        if (wasCreated) {
          created++;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to forward-fill snapshot for account ${account.id}: ${error}`,
        );
        skipped++;
      }
    }

    return { created, skipped };
  }

  /**
   * Forward-fill a snapshot for a specific account if missing.
   *
   * @param accountId - The account to check
   * @param userId - The user who owns the account
   * @param targetDate - The date to ensure a snapshot exists for
   * @returns true if a snapshot was created, false if one already existed
   */
  private async forwardFillForAccount(
    accountId: string,
    userId: string,
    targetDate: string,
  ): Promise<boolean> {
    // Check if snapshot already exists for this date
    const existingSnapshot =
      await this.balanceSnapshotService.findByAccountIdAndDate(
        accountId,
        userId,
        targetDate,
      );

    if (existingSnapshot) {
      this.logger.debug(
        `Snapshot already exists for account ${accountId} on ${targetDate}`,
      );
      return false;
    }

    // Find the most recent snapshot before the target date
    const previousSnapshot =
      await this.balanceSnapshotService.findMostRecentBeforeDate(
        accountId,
        userId,
        targetDate,
      );

    if (!previousSnapshot) {
      this.logger.debug(
        `No previous snapshot found for account ${accountId}, skipping forward-fill`,
      );
      return false;
    }

    // Create a new snapshot with the same balances, marked as FORWARD_FILL
    await this.balanceSnapshotService.upsert(
      {
        accountId,
        snapshotDate: targetDate,
        currentBalance: previousSnapshot.currentBalance,
        availableBalance: previousSnapshot.availableBalance,
        snapshotType: BalanceSnapshotType.FORWARD_FILL,
      },
      userId,
    );

    this.logger.log(
      `Created forward-fill snapshot for account ${accountId} on ${targetDate}`,
    );
    return true;
  }

  /**
   * Get yesterday's date as a YYYY-MM-DD string in the given timezone.
   */
  private getYesterdayDateString(userTimezone: string): string {
    return dayjs().tz(userTimezone).subtract(1, 'day').format('YYYY-MM-DD');
  }
}
