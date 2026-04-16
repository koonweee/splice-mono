import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import {
  LinkedAccountCreatedEvent,
  LinkedAccountEvents,
  LinkedAccountUpdatedEvent,
  ManualAccountBalanceUpdatedEvent,
  ManualAccountCreatedEvent,
  ManualAccountEvents,
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
      { eventType, accountId: event.account.id },
      'Handling linked account event',
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
        { eventType, accountId: event.account.id },
        'Balance snapshot upserted for linked account',
      );
    } catch (error) {
      this.logger.error(
        { eventType, accountId: event.account.id, error: String(error) },
        'Failed to upsert balance snapshot for linked account',
      );
    }
  }

  /**
   * Handle manual account created/updated events - upsert balance snapshot
   */
  @OnEvent(ManualAccountEvents.CREATED)
  @OnEvent(ManualAccountEvents.BALANCE_UPDATED)
  async handleManualAccountUpdate(
    event: ManualAccountCreatedEvent | ManualAccountBalanceUpdatedEvent,
  ): Promise<void> {
    if (event.account.manualValuationMode === 'holdings') {
      this.logger.log(
        { accountId: event.account.id },
        'Skipping manual balance snapshot for holdings-mode account',
      );
      return;
    }

    const eventType =
      event instanceof ManualAccountCreatedEvent
        ? 'manual_created'
        : 'manual_updated';

    this.logger.log(
      { eventType, accountId: event.account.id },
      'Handling manual account event',
    );

    try {
      const snapshotDate = await this.getSnapshotDate(event.account.userId);

      await this.balanceSnapshotService.upsert(
        {
          accountId: event.account.id,
          currentBalance: event.account.currentBalance,
          availableBalance: event.account.availableBalance,
          snapshotType: BalanceSnapshotType.USER_UPDATE,
          snapshotDate,
        },
        event.account.userId,
      );

      this.logger.log(
        { eventType, accountId: event.account.id },
        'Balance snapshot upserted for manual account',
      );
    } catch (error) {
      this.logger.error(
        { eventType, accountId: event.account.id, error: String(error) },
        'Failed to upsert balance snapshot for manual account',
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
