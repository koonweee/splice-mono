import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserEvents, UserSettingsUpdatedEvent } from '../events/user.events';
import { ExchangeRateService } from './exchange-rate.service';

/**
 * Listener for events that require exchange rate backfill
 */
@Injectable()
export class ExchangeRateListener {
  private readonly logger = new Logger(ExchangeRateListener.name);

  constructor(private readonly exchangeRateService: ExchangeRateService) {}

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
        `User ${event.userId} settings updated but currency unchanged, skipping backfill`,
      );
      return;
    }

    this.logger.log(
      `User ${event.userId} currency changed from ${event.oldSettings.currency} to ${event.newSettings.currency}, triggering exchange rate backfill`,
    );

    try {
      const rates = await this.exchangeRateService.backfillRatesForUser(
        event.userId,
      );
      this.logger.log(
        `Backfill complete for user ${event.userId}: ${rates.length} rates inserted`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to backfill exchange rates for user ${event.userId}: ${error}`,
      );
    }
  }
}
