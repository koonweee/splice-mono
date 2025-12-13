import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExchangeRateService } from './exchange-rate.service';

/**
 * Scheduled service for automated exchange rate fetching.
 * Runs daily to fetch exchange rates for all required currency pairs.
 */
@Injectable()
export class ExchangeRateScheduledService {
  private readonly logger = new Logger(ExchangeRateScheduledService.name);

  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  /**
   * Sync all required exchange rates daily at 6:00 AM UTC
   * This runs early in the day to ensure rates are available for daily calculations
   */
  @Cron('0 0 6 * * *', {
    name: 'syncDailyExchangeRates',
    timeZone: 'UTC',
  })
  async handleSyncDailyRates(): Promise<void> {
    this.logger.log({}, 'Starting scheduled sync of exchange rates');

    try {
      const rates = await this.exchangeRateService.syncDailyRates();
      this.logger.log(
        { ratesSynced: rates.length },
        'Scheduled exchange rate sync completed',
      );
    } catch (error) {
      this.logger.error(
        { error: String(error) },
        'Scheduled exchange rate sync failed',
      );
    }
  }

  /**
   * Sync crypto exchange rates hourly (ETH->USD, BTC->USD)
   * More frequent than fiat sync due to crypto price volatility
   * Runs at 5 minutes past the hour to avoid coinciding with balance sync
   */
  @Cron('0 5 * * * *', {
    name: 'syncHourlyCryptoRates',
    timeZone: 'UTC',
  })
  async handleSyncCryptoRates(): Promise<void> {
    this.logger.log({}, 'Starting hourly sync of crypto exchange rates');

    try {
      const rates = await this.exchangeRateService.syncCryptoRates();
      this.logger.log(
        { ratesSynced: rates.length },
        'Hourly crypto exchange rate sync completed',
      );
    } catch (error) {
      this.logger.error(
        { error: String(error) },
        'Hourly crypto exchange rate sync failed',
      );
    }
  }
}
