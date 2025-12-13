import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptoExchangeRateService } from '../crypto/crypto-exchange-rate.service';
import type { BalanceSnapshot } from '../types/BalanceSnapshot';
import { UserEntity } from '../user/user.entity';
import {
  ExchangeRateBackfillHelper,
  normalizeCurrencyPair,
} from './exchange-rate-backfill.helper';
import { ExchangeRateEntity } from './exchange-rate.entity';

/** Supported cryptocurrency codes */
const CRYPTO_CURRENCIES = ['ETH', 'BTC'];

/**
 * Service for ensuring exchange rates exist for balance snapshots.
 * Handles both fiat (Frankfurter) and crypto (CoinGecko) currencies.
 */
@Injectable()
export class SnapshotExchangeRateService {
  private readonly logger = new Logger(SnapshotExchangeRateService.name);

  constructor(
    @InjectRepository(ExchangeRateEntity)
    private repository: Repository<ExchangeRateEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private readonly backfillHelper: ExchangeRateBackfillHelper,
    private readonly cryptoExchangeRateService: CryptoExchangeRateService,
  ) {}

  /**
   * Ensure exchange rate exists for a balance snapshot.
   * Checks if rate already exists, fetches if not.
   * Fire-and-forget - errors are logged but not thrown.
   *
   * @param snapshot - The balance snapshot that was created/updated
   */
  async ensureRateForSnapshot(snapshot: BalanceSnapshot): Promise<void> {
    const { userId, snapshotDate } = snapshot;
    const snapshotCurrency = snapshot.currentBalance.money.currency;

    this.logger.log(
      { userId, snapshotDate, snapshotCurrency },
      'Ensuring exchange rate for snapshot',
    );

    try {
      // Get user's currency preference
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        this.logger.warn({ userId }, 'User not found');
        return;
      }
      const userCurrency = user.settings.currency;

      // Skip if currencies are the same
      if (snapshotCurrency === userCurrency) {
        this.logger.debug(
          { snapshotCurrency, userCurrency },
          'Currencies match, skipping rate fetch',
        );
        return;
      }

      // Check if rate already exists
      const rateExists = await this.checkRateExists(
        snapshotCurrency,
        userCurrency,
        snapshotDate,
      );

      if (rateExists) {
        this.logger.debug(
          { snapshotCurrency, userCurrency, snapshotDate },
          'Rate already exists',
        );
        return;
      }

      // Fetch and store the rate
      await this.fetchAndStoreRate(
        snapshotCurrency,
        userCurrency,
        snapshotDate,
      );
    } catch (error) {
      this.logger.error(
        {
          userId,
          snapshotDate,
          snapshotCurrency,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to ensure exchange rate for snapshot',
      );
      // Fire-and-forget - don't throw
    }
  }

  /**
   * Check if exchange rate exists for the given pair and date
   */
  private async checkRateExists(
    baseCurrency: string,
    targetCurrency: string,
    rateDate: string,
  ): Promise<boolean> {
    const { base, target } = normalizeCurrencyPair(
      baseCurrency,
      targetCurrency,
    );

    const existing = await this.repository.findOne({
      where: {
        baseCurrency: base,
        targetCurrency: target,
        rateDate,
      },
    });

    return existing !== null;
  }

  /**
   * Fetch rate from appropriate provider and store it
   */
  private async fetchAndStoreRate(
    snapshotCurrency: string,
    userCurrency: string,
    rateDate: string,
  ): Promise<void> {
    const isCrypto = this.isCryptoCurrency(snapshotCurrency);

    this.logger.log(
      { snapshotCurrency, userCurrency, rateDate, isCrypto },
      'Fetching exchange rate',
    );

    if (isCrypto) {
      await this.fetchCryptoRate(snapshotCurrency, userCurrency, rateDate);
    } else {
      await this.fetchFiatRate(snapshotCurrency, userCurrency, rateDate);
    }
  }

  /**
   * Check if currency is a cryptocurrency
   */
  private isCryptoCurrency(currency: string): boolean {
    return CRYPTO_CURRENCIES.includes(currency.toUpperCase());
  }

  /**
   * Fetch fiat currency rate from Frankfurter API
   */
  private async fetchFiatRate(
    baseCurrency: string,
    targetCurrency: string,
    rateDate: string,
  ): Promise<void> {
    const rates = await this.backfillHelper.fetchExchangeRates(baseCurrency, [
      targetCurrency,
    ]);

    const rate = rates.get(targetCurrency);
    if (rate === undefined) {
      this.logger.warn(
        { baseCurrency, targetCurrency },
        'No rate returned from Frankfurter API',
      );
      return;
    }

    await this.backfillHelper.upsertRate({
      baseCurrency,
      targetCurrency,
      rate,
      rateDate,
    });

    this.logger.log(
      { baseCurrency, targetCurrency, rate, rateDate },
      'Stored fiat exchange rate',
    );
  }

  /**
   * Fetch crypto currency rate from CoinGecko API
   */
  private async fetchCryptoRate(
    cryptoCurrency: string,
    fiatCurrency: string,
    rateDate: string,
  ): Promise<void> {
    const rate = await this.cryptoExchangeRateService.getRate(
      cryptoCurrency,
      fiatCurrency,
    );

    if (rate === 0) {
      this.logger.warn(
        { cryptoCurrency, fiatCurrency },
        'Received zero exchange rate from CoinGecko',
      );
      return;
    }

    await this.backfillHelper.upsertRate({
      baseCurrency: cryptoCurrency,
      targetCurrency: fiatCurrency,
      rate,
      rateDate,
    });

    this.logger.log(
      { cryptoCurrency, fiatCurrency, rate, rateDate },
      'Stored crypto exchange rate',
    );
  }
}
