import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { In, Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { TatumService } from '../common/tatum.service';
import type {
  CurrencyPair,
  DateRangeRateResponse,
  ExchangeRate,
  RateWithSource,
} from '../types/ExchangeRate';
import { UserEntity } from '../user/user.entity';
import {
  ExchangeRateBackfillHelper,
  normalizeCurrencyPair,
} from './exchange-rate-backfill.helper';
import { ExchangeRateEntity } from './exchange-rate.entity';

/** Supported cryptocurrency codes for exchange rate sync */
const CRYPTO_CURRENCIES = ['ETH', 'BTC'];

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    @InjectRepository(ExchangeRateEntity)
    private repository: Repository<ExchangeRateEntity>,
    @InjectRepository(AccountEntity)
    private accountRepository: Repository<AccountEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private readonly backfillHelper: ExchangeRateBackfillHelper,
    @Optional()
    @Inject(TatumService)
    private readonly tatumService?: TatumService,
  ) {}

  // ============================================================
  // PUBLIC QUERY METHODS
  // ============================================================

  /**
   * Get exchange rates for multiple currency pairs over a date range.
   * For dates without a rate in the database, fills from the last known
   * or next known rate.
   *
   * @param pairs - Array of currency pairs to fetch rates for
   * @param startDate - Start date (YYYY-MM-DD, inclusive)
   * @param endDate - End date (YYYY-MM-DD, inclusive)
   * @returns Array of rates grouped by date with source indicator
   * @throws Error if no rate exists at all for any requested pair
   */
  async getRatesForDateRange(
    pairs: CurrencyPair[],
    startDate: string,
    endDate: string,
  ): Promise<DateRangeRateResponse[]> {
    if (pairs.length === 0) {
      return [];
    }

    // Normalize all pairs and track mapping
    const normalizedPairs = pairs.map((pair) => ({
      original: pair,
      normalized: normalizeCurrencyPair(pair.baseCurrency, pair.targetCurrency),
    }));

    // Get unique normalized bases and targets for the query
    const normalizedBases = [
      ...new Set(normalizedPairs.map((p) => p.normalized.base)),
    ];
    const normalizedTargets = [
      ...new Set(normalizedPairs.map((p) => p.normalized.target)),
    ];

    // Query all matching rates from database
    const entities = await this.repository.find({
      where: {
        baseCurrency: In(normalizedBases),
        targetCurrency: In(normalizedTargets),
      },
      order: { rateDate: 'ASC' },
    });

    // Build lookup map: "base:target:date" -> rate
    const rateMap = new Map<string, number>();
    entities.forEach((entity) => {
      const rate =
        typeof entity.rate === 'string' ? parseFloat(entity.rate) : entity.rate;
      rateMap.set(
        `${entity.baseCurrency}:${entity.targetCurrency}:${entity.rateDate}`,
        rate,
      );
    });

    // For each pair, verify we have at least one rate
    normalizedPairs.forEach(({ original, normalized }) => {
      const hasAnyRate = entities.some(
        (e) =>
          e.baseCurrency === normalized.base &&
          e.targetCurrency === normalized.target,
      );
      if (!hasAnyRate) {
        throw new Error(
          `No exchange rate found for pair ${original.baseCurrency}→${original.targetCurrency}`,
        );
      }
    });

    // Build a sorted list of all dates we have rates for, per pair
    const pairRateDates = new Map<string, { date: string; rate: number }[]>();
    normalizedPairs.forEach(({ normalized }) => {
      const pairKey = `${normalized.base}:${normalized.target}`;
      if (!pairRateDates.has(pairKey)) {
        const pairEntities = entities
          .filter(
            (e) =>
              e.baseCurrency === normalized.base &&
              e.targetCurrency === normalized.target,
          )
          .map((e) => ({
            date: e.rateDate,
            rate: typeof e.rate === 'string' ? parseFloat(e.rate) : e.rate,
          }));
        pairRateDates.set(pairKey, pairEntities);
      }
    });

    // Generate results for each date in range
    const results: DateRangeRateResponse[] = [];
    let currentDate = dayjs(startDate);
    const end = dayjs(endDate);

    while (currentDate.diff(end, 'day') <= 0) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const rates: RateWithSource[] = [];

      normalizedPairs.forEach(({ original, normalized }) => {
        const pairKey = `${normalized.base}:${normalized.target}`;
        const lookupKey = `${normalized.base}:${normalized.target}:${dateStr}`;

        // Check if we have a DB rate for this exact date
        const dbRate = rateMap.get(lookupKey);

        let rate: number;
        let source: 'DB' | 'FILLED';

        if (dbRate !== undefined) {
          rate = dbRate;
          source = 'DB';
        } else {
          // Fill from closest known rate (prefer last known, fallback to next known)
          const pairDates = pairRateDates.get(pairKey)!;
          const filledRate = this.findClosestRate(pairDates, dateStr);
          rate = filledRate;
          source = 'FILLED';
        }

        // If the pair was inverted during normalization, invert the rate
        const finalRate = normalized.inverted ? 1 / rate : rate;

        rates.push({
          baseCurrency: original.baseCurrency,
          targetCurrency: original.targetCurrency,
          rate: finalRate,
          source,
        });
      });

      results.push({ date: dateStr, rates });
      currentDate = currentDate.add(1, 'day');
    }

    return results;
  }

  // ============================================================
  // SYNC METHODS (for scheduled jobs and controllers)
  // ============================================================

  /**
   * Sync all required exchange rates for today.
   * Called by the scheduled job.
   *
   * Optimizes API calls by:
   * 1. Skipping pairs that already have rates for today (batch check)
   * 2. Grouping remaining pairs by base currency
   */
  async syncDailyRates(): Promise<ExchangeRate[]> {
    const today = new Date().toISOString().split('T')[0];
    const pairs = await this.getRequiredCurrencyPairs();
    const results: ExchangeRate[] = [];

    if (pairs.length === 0) {
      this.logger.log({}, 'No currency pairs to sync');
      return results;
    }

    // Check which pairs already have rates for today
    const allBases = [...new Set(pairs.map((p) => p.baseCurrency))];

    // Get existing keys for today only - check all bases in parallel
    const existingKeysPromises = allBases.map((baseCurrency) => {
      const basePairs = pairs.filter((p) => p.baseCurrency === baseCurrency);
      const baseTargets = basePairs.map((p) => p.targetCurrency);
      return this.backfillHelper.getExistingRateKeys(
        baseCurrency,
        baseTargets,
        today,
        today,
      );
    });

    const existingKeysArrays = await Promise.all(existingKeysPromises);
    const existingKeys = new Set<string>();
    existingKeysArrays.forEach((keys) => {
      keys.forEach((key) => existingKeys.add(key));
    });

    // Filter out pairs that already have rates for today
    const pairsToSync = pairs.filter((pair) => {
      const key = `${pair.targetCurrency}:${today}`;
      return !existingKeys.has(key);
    });

    if (pairsToSync.length === 0) {
      this.logger.log(
        { count: pairs.length, date: today },
        'All currency pairs already have rates for date',
      );
      return results;
    }

    this.logger.log(
      {
        pairsToSync: pairsToSync.length,
        date: today,
        alreadyExist: pairs.length - pairsToSync.length,
      },
      'Syncing exchange rates for currency pairs',
    );

    // Group pairs by base currency to minimize API calls
    const pairsByBase = new Map<string, string[]>();
    pairsToSync.forEach((pair) => {
      const targets = pairsByBase.get(pair.baseCurrency) ?? [];
      targets.push(pair.targetCurrency);
      pairsByBase.set(pair.baseCurrency, targets);
    });

    // Fetch rates for each base currency (one API call per base)
    for (const [baseCurrency, targetCurrencies] of pairsByBase) {
      try {
        const rates = await this.backfillHelper.fetchExchangeRates(
          baseCurrency,
          targetCurrencies,
        );

        for (const [targetCurrency, rate] of rates) {
          const exchangeRate = await this.backfillHelper.upsertRate({
            baseCurrency,
            targetCurrency,
            rate,
            rateDate: today,
          });
          results.push(exchangeRate);
          this.logger.log(
            { baseCurrency, rate, targetCurrency },
            'Saved exchange rate',
          );
        }
      } catch (error) {
        this.logger.error(
          { baseCurrency, error: String(error) },
          'Error fetching rates for base currency',
        );
      }
    }

    this.logger.log({ count: results.length }, 'Synced exchange rates');
    return results;
  }

  /**
   * Sync cryptocurrency exchange rates (ETH->USD, BTC->USD)
   * Called by hourly scheduled job
   *
   * @returns Array of synced exchange rates
   */
  async syncCryptoRates(): Promise<ExchangeRate[]> {
    if (!this.tatumService) {
      this.logger.warn(
        {},
        'TatumService not available, skipping crypto rate sync',
      );
      return [];
    }

    const today = new Date().toISOString().split('T')[0];
    const results: ExchangeRate[] = [];

    this.logger.log(
      { currencies: CRYPTO_CURRENCIES, date: today },
      'Syncing crypto exchange rates',
    );

    for (const crypto of CRYPTO_CURRENCIES) {
      try {
        const rate = await this.tatumService.getExchangeRate(crypto);

        if (rate === 0) {
          this.logger.warn(
            { currency: crypto },
            'Received zero exchange rate, skipping',
          );
          continue;
        }

        const exchangeRate = await this.backfillHelper.upsertRate({
          baseCurrency: crypto,
          targetCurrency: 'USD',
          rate,
          rateDate: today,
        });

        results.push(exchangeRate);
        this.logger.log(
          { baseCurrency: crypto, targetCurrency: 'USD', rate },
          'Saved crypto exchange rate',
        );
      } catch (error) {
        this.logger.error(
          { currency: crypto, error: String(error) },
          'Error fetching crypto exchange rate',
        );
      }
    }

    this.logger.log({ count: results.length }, 'Synced crypto exchange rates');
    return results;
  }

  /**
   * Determine which currency pairs need to be tracked based on all users and their accounts.
   * Returns unique normalized pairs (alphabetically sorted) where the user's currency
   * differs from the account's currency.
   */
  async getRequiredCurrencyPairs(): Promise<CurrencyPair[]> {
    // Get all users with their currency setting
    const users = await this.userRepository.find({
      select: ['id', 'settings'],
    });

    // Fetch all user accounts in parallel
    const userAccountsResults = await Promise.all(
      users.map(async (user) => ({
        userCurrency: user.settings.currency,
        accounts: await this.accountRepository.find({
          where: { userId: user.id },
        }),
      })),
    );

    const pairsSet = new Set<string>();
    const pairs: CurrencyPair[] = [];

    userAccountsResults.forEach(({ userCurrency, accounts }) => {
      accounts.forEach((account) => {
        const accountCurrency = account.currentBalance.currency;

        // Skip if currencies are the same
        if (accountCurrency === userCurrency) {
          return;
        }

        // Normalize the pair to canonical form (alphabetically sorted)
        const { base, target } = normalizeCurrencyPair(
          accountCurrency,
          userCurrency,
        );

        // Create a unique key for this normalized pair
        const pairKey = `${base}:${target}`;

        if (!pairsSet.has(pairKey)) {
          pairsSet.add(pairKey);
          pairs.push({
            baseCurrency: base,
            targetCurrency: target,
          });
        }
      });
    });

    this.logger.log(
      { count: pairs.length },
      'Found unique currency pairs to track',
    );
    return pairs;
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Find the closest rate for a given date from a sorted list of rates.
   * Prefers the last known rate (before the date), falls back to next known rate.
   */
  private findClosestRate(
    sortedRates: { date: string; rate: number }[],
    targetDate: string,
  ): number {
    let lastKnown: number | undefined;
    let nextKnown: number | undefined;

    for (const { date, rate } of sortedRates) {
      if (date <= targetDate) {
        lastKnown = rate;
      } else if (nextKnown === undefined) {
        nextKnown = rate;
        break; // We found the next rate, no need to continue
      }
    }

    // Prefer last known, fallback to next known
    if (lastKnown !== undefined) {
      return lastKnown;
    }
    if (nextKnown !== undefined) {
      return nextKnown;
    }

    // This shouldn't happen since we verified the pair has at least one rate
    throw new Error(`No rate found for date ${targetDate}`);
  }
}
