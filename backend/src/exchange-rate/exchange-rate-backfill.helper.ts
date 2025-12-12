import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { Repository } from 'typeorm';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import type {
  CreateExchangeRateDto,
  CurrencyPair,
  ExchangeRate,
} from '../types/ExchangeRate';
import { UserEntity } from '../user/user.entity';
import { ExchangeRateEntity } from './exchange-rate.entity';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Currency pair with earliest date needed for backfill */
interface CurrencyPairWithDate extends CurrencyPair {
  earliestDate: string;
}

/**
 * Normalize a currency pair to a canonical form.
 * This ensures we only store one direction for each pair.
 *
 * Normalization rules (in order of priority):
 * 1. If USD is involved, always make USD the target (X → USD)
 *    This matches most exchange rate APIs which use USD as the base
 * 2. Otherwise, sort alphabetically (e.g., EUR → GBP, not GBP → EUR)
 *
 * @returns Object with normalized base/target and whether the pair was inverted
 */
export function normalizeCurrencyPair(
  baseCurrency: string,
  targetCurrency: string,
): { base: string; target: string; inverted: boolean } {
  // If USD is involved, always make it the target
  if (baseCurrency === 'USD') {
    // USD → X becomes X → USD (inverted)
    return { base: targetCurrency, target: 'USD', inverted: true };
  }
  if (targetCurrency === 'USD') {
    // X → USD stays as is
    return { base: baseCurrency, target: 'USD', inverted: false };
  }

  // For non-USD pairs, sort alphabetically
  if (baseCurrency <= targetCurrency) {
    return { base: baseCurrency, target: targetCurrency, inverted: false };
  }
  return { base: targetCurrency, target: baseCurrency, inverted: true };
}

@Injectable()
export class ExchangeRateBackfillHelper {
  private readonly logger = new Logger(ExchangeRateBackfillHelper.name);

  constructor(
    @InjectRepository(ExchangeRateEntity)
    private repository: Repository<ExchangeRateEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(BalanceSnapshotEntity)
    private balanceSnapshotRepository: Repository<BalanceSnapshotEntity>,
  ) {}

  // ============================================================
  // PUBLIC BACKFILL METHODS
  // ============================================================

  /**
   * Backfill exchange rates for a user based on their balance snapshots.
   * Gets all unique currency pairs from snapshots and fetches historical rates
   * from the earliest snapshot date to today.
   *
   * Batches requests by base currency to minimize API calls.
   * Stores only actual API responses (gaps on weekends/holidays are expected).
   *
   * @param userId - The user ID to backfill rates for
   * @returns Array of upserted exchange rates
   */
  async backfillRatesForUser(userId: string): Promise<ExchangeRate[]> {
    this.logger.log({ userId }, 'Starting exchange rate backfill for user');

    // Get user's currency preference and timezone
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      this.logger.error({ userId }, 'User not found');
      return [];
    }
    const userCurrency = user.settings.currency;
    const userTimezone = user.settings.timezone ?? 'UTC';

    // Get unique currency pairs with earliest dates from snapshots
    const pairs = await this.getUniqueCurrencyPairsFromSnapshots(
      userId,
      userCurrency,
    );

    if (pairs.length === 0) {
      this.logger.log({}, 'No currency pairs to backfill');
      return [];
    }

    this.logger.log(
      {
        count: pairs.length,
        pairs: pairs.map((p) => ({
          baseCurrency: p.baseCurrency,
          targetCurrency: p.targetCurrency,
          earliestDate: p.earliestDate
        }))
      },
      'Found currency pairs to backfill',
    );

    // Group pairs by base currency for batched API requests
    // For each base, track target currencies and the earliest date needed
    const pairsByBase = new Map<
      string,
      { targets: string[]; earliestDate: string }
    >();

    pairs.forEach((pair) => {
      const existing = pairsByBase.get(pair.baseCurrency);
      if (existing) {
        existing.targets.push(pair.targetCurrency);
        // Use the earlier of the two dates
        if (pair.earliestDate < existing.earliestDate) {
          existing.earliestDate = pair.earliestDate;
        }
      } else {
        pairsByBase.set(pair.baseCurrency, {
          targets: [pair.targetCurrency],
          earliestDate: pair.earliestDate,
        });
      }
    });

    this.logger.log(
      { batchCount: pairsByBase.size },
      'Batched into API requests by base currency',
    );

    const results: ExchangeRate[] = [];
    const today = dayjs().tz(userTimezone).format('YYYY-MM-DD');

    // Fetch and upsert rates for each base currency (one API call per base)
    for (const [baseCurrency, { targets, earliestDate }] of pairsByBase) {
      try {
        // Get all existing rates for this base currency and targets in one query
        const existingKeys = await this.getExistingRateKeys(
          baseCurrency,
          targets,
          earliestDate,
          today,
        );

        // Check if all required keys already exist - if so, skip the API call entirely
        const requiredKeys = this.generateRequiredRateKeys(
          targets,
          earliestDate,
          today,
        );
        const missingKeys = requiredKeys.filter(
          (key) => !existingKeys.has(key),
        );

        if (missingKeys.length === 0) {
          this.logger.log(
            {
              baseCurrency,
              targetCurrencies: targets,
              totalRates: requiredKeys.length
            },
            'Skipping API call - all rates already exist',
          );
          continue;
        }

        this.logger.log(
          {
            baseCurrency,
            targetCurrencies: targets,
            missingRates: missingKeys.length,
            totalRates: requiredKeys.length
          },
          'Fetching rates from API',
        );

        // Fetch rates from API (will have gaps on weekends/holidays)
        const ratesByDateAndTarget = await this.fetchTimeSeriesRatesBatched(
          baseCurrency,
          targets,
          earliestDate,
          today,
        );

        // Count how many we're skipping vs inserting
        let skipped = 0;
        let inserted = 0;

        // Only insert rates for dates that don't already exist
        for (const [dateKey, targetRates] of ratesByDateAndTarget) {
          for (const [targetCurrency, rate] of targetRates) {
            const key = `${targetCurrency}:${dateKey}`;
            if (existingKeys.has(key)) {
              skipped++;
              continue;
            }

            const exchangeRate = await this.upsertRate({
              baseCurrency,
              targetCurrency,
              rate,
              rateDate: dateKey,
            });
            results.push(exchangeRate);
            inserted++;
          }
        }

        this.logger.log(
          {
            baseCurrency,
            targetCurrencies: targets,
            inserted,
            skipped
          },
          'Processed rates',
        );
      } catch (error) {
        this.logger.error(
          {
            baseCurrency,
            targetCurrencies: targets,
            error: error instanceof Error ? error.message : String(error)
          },
          'Error backfilling rates',
        );
      }
    }

    this.logger.log(
      { insertedCount: results.length },
      'Backfill complete',
    );
    return results;
  }

  // ============================================================
  // API FETCH METHODS (also used by sync)
  // ============================================================

  /**
   * Fetch JSON from Frankfurter API with error handling.
   * https://frankfurter.dev - Free, open-source currency data API.
   * No API keys or rate limits required.
   */
  async fetchFromFrankfurter<T>(
    url: string,
    description: string,
  ): Promise<T | null> {
    try {
      this.logger.log({ description }, 'Fetching from Frankfurter');

      const response = await fetch(url);

      if (!response.ok) {
        this.logger.error(
          {
            status: response.status,
            statusText: response.statusText
          },
          'Frankfurter API error',
        );
        return null;
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch from Frankfurter',
      );
      return null;
    }
  }

  /**
   * Fetch latest exchange rates for multiple target currencies in a single API call.
   */
  async fetchExchangeRates(
    baseCurrency: string,
    targetCurrencies: string[],
  ): Promise<Map<string, number>> {
    const symbols = targetCurrencies.join(',');
    const url = `https://api.frankfurter.dev/v1/latest?base=${baseCurrency}&symbols=${symbols}`;

    const data = await this.fetchFromFrankfurter<{
      base: string;
      date: string;
      rates: Record<string, number>;
    }>(url, `${baseCurrency}→[${symbols}]`);

    if (!data) {
      return new Map();
    }

    const rates = new Map<string, number>();
    Object.entries(data.rates).forEach(([currency, rate]) => {
      rates.set(currency, rate);
    });

    this.logger.log(
      {
        baseCurrency,
        rateCount: rates.size,
        date: data.date
      },
      'Fetched rates',
    );

    return rates;
  }

  /**
   * Fetch time series exchange rates from Frankfurter API for multiple target currencies.
   * Returns rates for each day in the date range, grouped by date and target currency.
   *
   * @param baseCurrency - Source currency
   * @param targetCurrencies - Array of target currencies
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns Map of date -> Map of targetCurrency -> rate
   */
  async fetchTimeSeriesRatesBatched(
    baseCurrency: string,
    targetCurrencies: string[],
    startDate: string,
    endDate: string,
  ): Promise<Map<string, Map<string, number>>> {
    const symbols = targetCurrencies.join(',');
    const url = `https://api.frankfurter.dev/v1/${startDate}..${endDate}?base=${baseCurrency}&symbols=${symbols}`;

    const data = await this.fetchFromFrankfurter<{
      amount: number;
      base: string;
      start_date: string;
      end_date: string;
      rates: Record<string, Record<string, number>>;
    }>(url, `${baseCurrency}→[${symbols}] (${startDate} to ${endDate})`);

    if (!data) {
      return new Map();
    }

    // Parse the time series response
    const rates = new Map<string, Map<string, number>>();
    Object.entries(data.rates).forEach(([date, currencyRates]) => {
      const dateRates = new Map<string, number>();
      Object.entries(currencyRates).forEach(([currency, rate]) => {
        dateRates.set(currency, rate);
      });
      rates.set(date, dateRates);
    });

    this.logger.log(
      {
        baseCurrency,
        targetCurrencies: symbols,
        dateCount: rates.size
      },
      'Fetched time series rates',
    );

    return rates;
  }

  // ============================================================
  // DATABASE METHODS (also used by sync)
  // ============================================================

  /**
   * Create or update an exchange rate for a specific date.
   * Normalizes the currency pair alphabetically before storing.
   */
  async upsertRate(dto: CreateExchangeRateDto): Promise<ExchangeRate> {
    // Normalize the pair to canonical form (alphabetically sorted)
    const { base, target, inverted } = normalizeCurrencyPair(
      dto.baseCurrency,
      dto.targetCurrency,
    );

    // If inverted, we need to store the inverse rate
    const normalizedRate = inverted ? 1 / dto.rate : dto.rate;

    // Check if rate already exists for this normalized pair and date
    const existing = await this.repository.findOne({
      where: {
        baseCurrency: base,
        targetCurrency: target,
        rateDate: dto.rateDate,
      },
    });

    if (existing) {
      existing.rate = normalizedRate;
      const saved = await this.repository.save(existing);
      return saved.toObject();
    }

    const entity = ExchangeRateEntity.fromDto({
      baseCurrency: base,
      targetCurrency: target,
      rate: normalizedRate,
      rateDate: dto.rateDate,
    });
    const saved = await this.repository.save(entity);
    return saved.toObject();
  }

  /**
   * Get existing rates for a base currency and multiple targets within a date range.
   * Returns a Set of "targetCurrency:date" for rates that already exist.
   *
   * @param baseCurrency - The base currency (will be normalized)
   * @param targetCurrencies - Array of target currencies
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns Set of "targetCurrency:date" keys that already have rates
   */
  async getExistingRateKeys(
    baseCurrency: string,
    targetCurrencies: string[],
    startDate: string,
    endDate: string,
  ): Promise<Set<string>> {
    // Normalize all pairs to get the actual base/target stored in DB
    const normalizedPairs = targetCurrencies.map((target) =>
      normalizeCurrencyPair(baseCurrency, target),
    );

    // Get unique normalized bases and targets
    const normalizedBases = [...new Set(normalizedPairs.map((p) => p.base))];
    const normalizedTargets = [
      ...new Set(normalizedPairs.map((p) => p.target)),
    ];

    const entities = await this.repository
      .createQueryBuilder('rate')
      .select(['rate.baseCurrency', 'rate.targetCurrency', 'rate.rateDate'])
      .where('rate.baseCurrency IN (:...bases)', { bases: normalizedBases })
      .andWhere('rate.targetCurrency IN (:...targets)', {
        targets: normalizedTargets,
      })
      .andWhere('rate.rateDate >= :startDate', { startDate })
      .andWhere('rate.rateDate <= :endDate', { endDate })
      .getMany();

    // Build a set of existing keys using the original (non-normalized) target currency
    // so we can look up by what the caller passed in
    const existingKeys = new Set<string>();

    entities.forEach((entity) => {
      // Find which original target currency this maps to
      targetCurrencies.forEach((targetCurrency, i) => {
        const normalized = normalizedPairs[i];
        if (
          entity.baseCurrency === normalized.base &&
          entity.targetCurrency === normalized.target
        ) {
          existingKeys.add(`${targetCurrency}:${entity.rateDate}`);
        }
      });
    });

    return existingKeys;
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Get unique currency pairs from a user's balance snapshots with their earliest dates.
   * Pairs are normalized (alphabetically sorted, USD always as target when involved).
   *
   * @param userId - The user ID
   * @param userCurrency - The user's preferred currency
   * @returns Array of normalized currency pairs with earliest dates
   */
  private async getUniqueCurrencyPairsFromSnapshots(
    userId: string,
    userCurrency: string,
  ): Promise<CurrencyPairWithDate[]> {
    // Query to get snapshots ordered by date to find earliest per currency pair
    const snapshots = await this.balanceSnapshotRepository.find({
      where: { userId },
      order: { snapshotDate: 'ASC' },
    });

    // Track unique pairs with their earliest dates
    const pairsMap = new Map<
      string,
      { base: string; target: string; earliestDate: string }
    >();

    snapshots.forEach((snapshot) => {
      const snapshotCurrency = snapshot.currentBalance.currency;

      // Skip if currencies are the same
      if (snapshotCurrency === userCurrency) {
        return;
      }

      // Normalize the pair
      const { base, target } = normalizeCurrencyPair(
        snapshotCurrency,
        userCurrency,
      );
      const pairKey = `${base}:${target}`;

      // Only store if we haven't seen this pair yet (earliest date wins due to ASC order)
      if (!pairsMap.has(pairKey)) {
        pairsMap.set(pairKey, {
          base,
          target,
          earliestDate: snapshot.snapshotDate,
        });
      }
    });

    return Array.from(pairsMap.values()).map((p) => ({
      baseCurrency: p.base,
      targetCurrency: p.target,
      earliestDate: p.earliestDate,
    }));
  }

  /**
   * Generate all required rate keys for a set of target currencies and date range.
   * Keys are in the format "targetCurrency:YYYY-MM-DD".
   */
  private generateRequiredRateKeys(
    targetCurrencies: string[],
    startDate: string,
    endDate: string,
  ): string[] {
    const keys: string[] = [];
    let currentDate = dayjs(startDate);
    const end = dayjs(endDate);

    // Use diff to check if we haven't passed the end date
    while (currentDate.diff(end, 'day') <= 0) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      targetCurrencies.forEach((target) => {
        keys.push(`${target}:${dateStr}`);
      });
      currentDate = currentDate.add(1, 'day');
    }

    return keys;
  }
}
