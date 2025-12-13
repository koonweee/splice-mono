import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  BalanceSnapshotCreatedEvent,
  BalanceSnapshotEvents,
  BalanceSnapshotUpdatedEvent,
} from '../events/balance-snapshot.events';
import { UserEvents, UserSettingsUpdatedEvent } from '../events/user.events';
import { ExchangeRateBackfillHelper } from './exchange-rate-backfill.helper';
import { SnapshotExchangeRateService } from './snapshot-exchange-rate.service';

/**
 * Listener for events that require exchange rate backfill
 */
@Injectable()
export class ExchangeRateListener {
  private readonly logger = new Logger(ExchangeRateListener.name);

  constructor(
    private readonly backfillHelper: ExchangeRateBackfillHelper,
    private readonly snapshotExchangeRateService: SnapshotExchangeRateService,
  ) {}

  /**
   * Handle user settings updated event.
   * When the user's currency changes, backfill exchange rates for their snapshots.
   */
  @OnEvent(UserEvents.SETTINGS_UPDATED)
  async handleUserSettingsUpdated(
    event: UserSettingsUpdatedEvent,
  ): Promise<void> {
    if (!event.currencyChanged) {
      this.logger.debug(
        { userId: event.userId },
        'User settings updated but currency unchanged, skipping backfill',
      );
      return;
    }

    this.logger.log(
      {
        userId: event.userId,
        oldCurrency: event.oldSettings.currency,
        newCurrency: event.newSettings.currency,
      },
      'User currency changed, triggering exchange rate backfill',
    );

    try {
      const rates = await this.backfillHelper.backfillRatesForUser(
        event.userId,
      );
      this.logger.log(
        { userId: event.userId, ratesInserted: rates.length },
        'Backfill complete for user',
      );
    } catch (error) {
      this.logger.error(
        { userId: event.userId, error: String(error) },
        'Failed to backfill exchange rates for user',
      );
    }
  }

  /**
   * Handle balance snapshot created/updated events.
   * Ensures exchange rate exists for the snapshot's currency pair.
   * Fire-and-forget - does not block snapshot creation.
   */
  @OnEvent(BalanceSnapshotEvents.CREATED)
  @OnEvent(BalanceSnapshotEvents.UPDATED)
  handleBalanceSnapshotChanged(
    event: BalanceSnapshotCreatedEvent | BalanceSnapshotUpdatedEvent,
  ): void {
    const eventType =
      event instanceof BalanceSnapshotCreatedEvent ? 'created' : 'updated';

    this.logger.log(
      { eventType, snapshotId: event.snapshot.id },
      'Handling balance snapshot event',
    );

    // Fire-and-forget: don't await, let it run in background
    this.snapshotExchangeRateService
      .ensureRateForSnapshot(event.snapshot)
      .catch((error) => {
        this.logger.error(
          {
            snapshotId: event.snapshot.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Error in fire-and-forget exchange rate fetch',
        );
      });
  }
}
