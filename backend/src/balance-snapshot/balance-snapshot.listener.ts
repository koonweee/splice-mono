import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import {
  LinkedAccountCreatedEvent,
  LinkedAccountEvents,
  LinkedAccountUpdatedEvent,
} from '../events/account.events';
import { BalanceSnapshotType } from '../types/BalanceSnapshot';
import { UserService } from '../user/user.service';
import { BalanceSnapshotService } from './balance-snapshot.service';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Listens for linked account events and creates/updates balance snapshots
 */
@Injectable()
export class BalanceSnapshotListener {
  private readonly logger = new Logger(BalanceSnapshotListener.name);

  constructor(
    private readonly balanceSnapshotService: BalanceSnapshotService,
    private readonly userService: UserService,
  ) {}

  /**
   * Handle linked account created/updated events - upsert balance snapshot
   */
  @OnEvent(LinkedAccountEvents.CREATED)
  @OnEvent(LinkedAccountEvents.UPDATED)
  async handleLinkedAccountChanged(
    event: LinkedAccountCreatedEvent | LinkedAccountUpdatedEvent,
  ): Promise<void> {
    const eventType =
      event instanceof LinkedAccountCreatedEvent ? 'created' : 'updated';

    this.logger.log(
      `Handling linked account ${eventType} event: accountId=${event.account.id}`,
    );

    try {
      const snapshotDate = await this.getSnapshotDate(event.account.userId);

      await this.balanceSnapshotService.upsert(
        {
          accountId: event.account.id,
          currentBalance: event.account.currentBalance,
          availableBalance: event.account.availableBalance,
          snapshotType: BalanceSnapshotType.SYNC,
          snapshotDate,
        },
        event.account.userId,
      );

      this.logger.log(
        `Balance snapshot upserted for ${eventType} linked account: ${event.account.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to upsert balance snapshot for ${eventType} linked account ${event.account.id}: ${error}`,
      );
    }
  }

  /**
   * Get the snapshot date to use by returning today in the user's timezone
   *
   * Truncates to only the date part (YYYY-MM-DD) and ignores the time part
   */
  private async getSnapshotDate(userId: string): Promise<string> {
    const timezone = await this.userService.getTimezone(userId);
    return dayjs().tz(timezone).format('YYYY-MM-DD');
  }
}
