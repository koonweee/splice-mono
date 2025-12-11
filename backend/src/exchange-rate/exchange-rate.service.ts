import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
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
function normalizeCurrencyPair(
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

/** Cached rate entry with metadata */
interface CachedRate {
  rate: number;
  rateDate: string;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  /** Cache: Map<"BASE:TARGET:DATE", rate> for date-specific lookups */
  private rateCache = new Map<string, number>();

  /** Cache: Map<"BASE:TARGET", {rate, rateDate}> for latest rate lookups */
  private latestRateCache = new Map<string, CachedRate>();

  /** Timestamp when cache was last loaded */
  private cacheLoadedAt: Date | null = null;

  /** Cache time-to-live in milliseconds (1 hour) */
  private readonly CACHE_TTL_MS = 60 * 60 * 1000;

  constructor(
    @InjectRepository(ExchangeRateEntity)
    private repository: Repository<ExchangeRateEntity>,
    @InjectRepository(AccountEntity)
    private accountRepository: Repository<AccountEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(BalanceSnapshotEntity)
    private balanceSnapshotRepository: Repository<BalanceSnapshotEntity>,
  ) {}

  // ============================================================
  // PUBLIC CACHE-BASED METHODS (use these from other services)
  // ============================================================

  /**
   * Get exchange rate from cache for a currency pair.
   * Automatically handles inverse pairs and normalization.
   *
   * @param baseCurrency - Source currency (e.g., 'EUR')
   * @param targetCurrency - Target currency (e.g., 'USD')
   * @param rateDate - Optional specific date (YYYY-MM-DD), defaults to latest
   * @returns The exchange rate, or null if not found
   */
  async getRate(
    baseCurrency: string,
    targetCurrency: string,
    rateDate?: string,
  ): Promise<number | null> {
    // Same currency - rate is always 1
    if (baseCurrency === targetCurrency) {
      return 1;
    }

    await this.ensureCacheLoaded();

    const { base, target, inverted } = normalizeCurrencyPair(
      baseCurrency,
      targetCurrency,
    );

    let rate: number | undefined;

    if (rateDate) {
      // Look up date-specific rate
      rate = this.rateCache.get(`${base}:${target}:${rateDate}`);
    } else {
      // Look up latest rate
      const cached = this.latestRateCache.get(`${base}:${target}`);
      rate = cached?.rate;
    }

    if (rate === undefined) {
      return null;
    }

    // If we need the inverse, compute it
    return inverted ? 1 / rate : rate;
  }

  /**
   * Get the latest exchange rate for a currency pair.
   * Alias for getRate without a date parameter.
   */
  async getLatestRate(
    baseCurrency: string,
    targetCurrency: string,
  ): Promise<number | null> {
    return this.getRate(baseCurrency, targetCurrency);
  }

  /**
   * Get all exchange rates for a specific date from cache.
   */
  async getRatesForDate(rateDate: string): Promise<ExchangeRate[]> {
    await this.ensureCacheLoaded();

    const results: ExchangeRate[] = [];
    const datePrefix = `:${rateDate}`;

    for (const [key, rate] of this.rateCache.entries()) {
      if (key.endsWith(datePrefix)) {
        const [baseCurrency, targetCurrency] = key.split(':');
        results.push({
          id: '', // Cache doesn't store IDs
          baseCurrency,
          targetCurrency,
          rate,
          rateDate,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * Invalidate the cache, forcing a reload on next access.
   * Call this after syncing new rates.
   */
  invalidateCache(): void {
    this.logger.log('Invalidating exchange rate cache');
    this.cacheLoadedAt = null;
  }

  /**
   * Force reload the cache immediately.
   * Useful after bulk updates.
   */
  async reloadCache(): Promise<void> {
    this.cacheLoadedAt = null;
    await this.ensureCacheLoaded();
  }

  // ============================================================
  // SYNC / ADMIN METHODS (for scheduled jobs and controllers)
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
      this.logger.log('No currency pairs to sync');
      return results;
    }

    // Check which pairs already have rates for today (single query)
    const allTargets = pairs.map((p) => p.targetCurrency);
    const allBases = [...new Set(pairs.map((p) => p.baseCurrency))];

    // For sync, we use the first base as reference since we need to check all pairs
    // Get existing keys for today only
    const existingKeys = await this.getExistingRateKeys(
      allBases[0],
      allTargets,
      today,
      today,
    );

    // Also check other bases if there are multiple
    for (let i = 1; i < allBases.length; i++) {
      const basePairs = pairs.filter((p) => p.baseCurrency === allBases[i]);
      const baseTargets = basePairs.map((p) => p.targetCurrency);
      const moreKeys = await this.getExistingRateKeys(
        allBases[i],
        baseTargets,
        today,
        today,
      );
      moreKeys.forEach((key) => existingKeys.add(key));
    }

    // Filter out pairs that already have rates for today
    const pairsToSync = pairs.filter((pair) => {
      const key = `${pair.targetCurrency}:${today}`;
      return !existingKeys.has(key);
    });

    if (pairsToSync.length === 0) {
      this.logger.log(
        `All ${pairs.length} currency pairs already have rates for ${today}`,
      );
      return results;
    }

    this.logger.log(
      `Syncing exchange rates for ${pairsToSync.length} currency pairs on ${today} (${pairs.length - pairsToSync.length} already exist)`,
    );

    // Group pairs by base currency to minimize API calls
    const pairsByBase = new Map<string, string[]>();
    for (const pair of pairsToSync) {
      const targets = pairsByBase.get(pair.baseCurrency) ?? [];
      targets.push(pair.targetCurrency);
      pairsByBase.set(pair.baseCurrency, targets);
    }

    // Fetch rates for each base currency (one API call per base)
    for (const [baseCurrency, targetCurrencies] of pairsByBase) {
      try {
        const rates = await this.fetchExchangeRates(
          baseCurrency,
          targetCurrencies,
        );

        for (const [targetCurrency, rate] of rates) {
          const exchangeRate = await this.upsertRate({
            baseCurrency,
            targetCurrency,
            rate,
            rateDate: today,
          });
          results.push(exchangeRate);
          this.logger.log(
            `Saved rate: 1 ${baseCurrency} = ${rate} ${targetCurrency}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error fetching rates for base ${baseCurrency}: ${error}`,
        );
      }
    }

    // Invalidate cache after sync so new rates are picked up
    if (results.length > 0) {
      this.invalidateCache();
    }

    this.logger.log(`Synced ${results.length} exchange rates`);
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

    const pairsSet = new Set<string>();
    const pairs: CurrencyPair[] = [];

    for (const user of users) {
      const userCurrency = user.settings.currency;

      // Get all accounts for this user
      // Note: We don't use select here because currentBalance is an embedded column
      // (BalanceColumns) which creates multiple DB columns (currentBalanceAmount,
      // currentBalanceCurrency, currentBalanceSign)
      const accounts = await this.accountRepository.find({
        where: { userId: user.id },
      });

      for (const account of accounts) {
        const accountCurrency = account.currentBalance.currency;

        // Skip if currencies are the same
        if (accountCurrency === userCurrency) {
          continue;
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
      }
    }

    this.logger.log(`Found ${pairs.length} unique currency pairs to track`);
    return pairs;
  }

  // ============================================================
  // PRIVATE METHODS (internal use only)
  // ============================================================

  /**
   * Ensure cache is loaded, refreshing if TTL has expired.
   */
  private async ensureCacheLoaded(): Promise<void> {
    const now = new Date();

    // Skip if cache is still fresh
    if (
      this.cacheLoadedAt &&
      now.getTime() - this.cacheLoadedAt.getTime() < this.CACHE_TTL_MS
    ) {
      return;
    }

    await this.loadCacheFromDb();
  }

  /**
   * Load all exchange rates from database into memory cache.
   */
  private async loadCacheFromDb(): Promise<void> {
    this.logger.log('Loading exchange rate cache from database...');

    const entities = await this.repository.find({
      order: { rateDate: 'DESC' },
    });

    this.rateCache.clear();
    this.latestRateCache.clear();

    for (const entity of entities) {
      const rate =
        typeof entity.rate === 'string' ? parseFloat(entity.rate) : entity.rate;

      // Cache by date for date-specific lookups
      const dateKey = `${entity.baseCurrency}:${entity.targetCurrency}:${entity.rateDate}`;
      this.rateCache.set(dateKey, rate);

      // Cache latest rate (first one per pair wins since sorted DESC by date)
      const latestKey = `${entity.baseCurrency}:${entity.targetCurrency}`;
      if (!this.latestRateCache.has(latestKey)) {
        this.latestRateCache.set(latestKey, {
          rate,
          rateDate: entity.rateDate,
        });
      }
    }

    this.cacheLoadedAt = new Date();
    this.logger.log(
      `Loaded ${this.rateCache.size} exchange rates into cache (${this.latestRateCache.size} unique pairs)`,
    );
  }

  /**
   * Get existing rates for a base currency and multiple targets within a date range.
   * Returns a Map of "targetCurrency:date" -> true for rates that already exist.
   *
   * @param baseCurrency - The base currency (will be normalized)
   * @param targetCurrencies - Array of target currencies
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns Set of "targetCurrency:date" keys that already have rates
   */
  private async getExistingRateKeys(
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

    for (const entity of entities) {
      // Find which original target currency this maps to
      for (let i = 0; i < targetCurrencies.length; i++) {
        const normalized = normalizedPairs[i];
        if (
          entity.baseCurrency === normalized.base &&
          entity.targetCurrency === normalized.target
        ) {
          existingKeys.add(`${targetCurrencies[i]}:${entity.rateDate}`);
        }
      }
    }

    return existingKeys;
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
      for (const target of targetCurrencies) {
        keys.push(`${target}:${dateStr}`);
      }
      currentDate = currentDate.add(1, 'day');
    }

    return keys;
  }

  /**
   * Forward-fill missing dates in exchange rate data.
   * The API only returns rates for working days, so weekends and holidays are missing.
   * This fills those gaps using the last known rate for each currency.
   *
   * @param ratesByDate - Map of date -> Map of targetCurrency -> rate (from API)
   * @param targetCurrencies - List of target currencies to fill
   * @param startDate - Start of the date range we need (YYYY-MM-DD)
   * @param endDate - End of the date range we need (YYYY-MM-DD)
   * @returns Map with all dates in range filled, using forward-fill for missing dates
   */
  private forwardFillRates(
    ratesByDate: Map<string, Map<string, number>>,
    targetCurrencies: string[],
    startDate: string,
    endDate: string,
  ): Map<string, Map<string, number>> {
    const filledRates = new Map<string, Map<string, number>>();

    // Get all dates from the API response sorted chronologically
    const apiDates = [...ratesByDate.keys()].sort();

    // Track the last known rate for each currency (for forward-filling)
    const lastKnownRates = new Map<string, number>();

    // Initialize last known rates from dates before our start date (from the buffer)
    for (const apiDate of apiDates) {
      if (apiDate >= startDate) break;
      const dateRates = ratesByDate.get(apiDate);
      if (dateRates) {
        for (const [currency, rate] of dateRates) {
          lastKnownRates.set(currency, rate);
        }
      }
    }

    // Iterate through each day in the requested range
    let currentDate = dayjs(startDate);
    const end = dayjs(endDate);

    while (currentDate.diff(end, 'day') <= 0) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const apiRates = ratesByDate.get(dateStr);

      const dateRates = new Map<string, number>();

      for (const currency of targetCurrencies) {
        // Try to get the rate from API response first
        const apiRate = apiRates?.get(currency);

        if (apiRate !== undefined) {
          // Use the API rate and update last known
          dateRates.set(currency, apiRate);
          lastKnownRates.set(currency, apiRate);
        } else {
          // Forward-fill from last known rate
          const lastRate = lastKnownRates.get(currency);
          if (lastRate !== undefined) {
            dateRates.set(currency, lastRate);
          }
          // If no last known rate, we skip this currency for this date
          this.logger.warn(`No last known rate for ${currency} on ${dateStr}`);
        }
      }

      // Only add the date if we have at least one rate
      if (dateRates.size > 0) {
        filledRates.set(dateStr, dateRates);
      }

      currentDate = currentDate.add(1, 'day');
    }

    return filledRates;
  }

  /**
   * Create or update an exchange rate for a specific date.
   * Normalizes the currency pair alphabetically before storing.
   */
  private async upsertRate(dto: CreateExchangeRateDto): Promise<ExchangeRate> {
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
   * Fetch JSON from Frankfurter API with error handling.
   * https://frankfurter.dev - Free, open-source currency data API.
   * No API keys or rate limits required.
   */
  private async fetchFromFrankfurter<T>(
    url: string,
    description: string,
  ): Promise<T | null> {
    try {
      this.logger.log(`Fetching from Frankfurter: ${description}`);

      const response = await fetch(url);

      if (!response.ok) {
        this.logger.error(
          `Frankfurter API error: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.error(`Failed to fetch from Frankfurter: ${error}`);
      return null;
    }
  }

  /**
   * Fetch latest exchange rates for multiple target currencies in a single API call.
   */
  private async fetchExchangeRates(
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
    for (const [currency, rate] of Object.entries(data.rates)) {
      rates.set(currency, rate);
    }

    this.logger.log(
      `Fetched ${rates.size} rates for base ${baseCurrency} (date: ${data.date})`,
    );

    return rates;
  }

  // ============================================================
  // BACKFILL METHODS (for historical data population)
  // ============================================================

  /**
   * Backfill exchange rates for a user based on their balance snapshots.
   * Gets all unique currency pairs from snapshots and fetches historical rates
   * from the earliest snapshot date to today.
   *
   * Batches requests by base currency to minimize API calls.
   *
   * @param userId - The user ID to backfill rates for
   * @returns Array of upserted exchange rates
   */
  async backfillRatesForUser(userId: string): Promise<ExchangeRate[]> {
    this.logger.log(`Starting exchange rate backfill for user: ${userId}`);

    // Get user's currency preference and timezone
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      this.logger.error(`User not found: ${userId}`);
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
      this.logger.log('No currency pairs to backfill');
      return [];
    }

    this.logger.log(
      `Found ${pairs.length} currency pairs to backfill: ${pairs.map((p) => `${p.baseCurrency}→${p.targetCurrency} (from ${p.earliestDate})`).join(', ')}`,
    );

    // Group pairs by base currency for batched API requests
    // For each base, track target currencies and the earliest date needed
    const pairsByBase = new Map<
      string,
      { targets: string[]; earliestDate: string }
    >();

    for (const pair of pairs) {
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
    }

    this.logger.log(
      `Batched into ${pairsByBase.size} API requests by base currency`,
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
            `Skipping API call for ${baseCurrency}→[${targets.join(',')}]: all ${requiredKeys.length} rates already exist`,
          );
          continue;
        }

        this.logger.log(
          `Fetching ${baseCurrency}→[${targets.join(',')}]: ${missingKeys.length}/${requiredKeys.length} rates missing`,
        );

        // Add 5-day buffer to query dates to handle weekends/holidays for forward-filling
        const bufferedStartDate = dayjs(earliestDate)
          .subtract(5, 'day')
          .format('YYYY-MM-DD');
        const bufferedEndDate = dayjs(today).add(5, 'day').format('YYYY-MM-DD');

        const ratesByDateAndTarget = await this.fetchTimeSeriesRatesBatched(
          baseCurrency,
          targets,
          bufferedStartDate,
          bufferedEndDate,
        );

        // Forward-fill missing dates (weekends/holidays) using last known rates
        const filledRates = this.forwardFillRates(
          ratesByDateAndTarget,
          targets,
          earliestDate,
          today,
        );

        // Count how many we're skipping vs inserting
        let skipped = 0;
        let inserted = 0;

        // Only insert rates for dates that don't already exist
        for (const [dateKey, targetRates] of filledRates) {
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
          `Processed ${baseCurrency}→[${targets.join(',')}]: ${inserted} inserted, ${skipped} skipped (already exist)`,
        );
      } catch (error) {
        this.logger.error(
          `Error backfilling rates for ${baseCurrency}→[${targets.join(',')}]: ${error}`,
        );
      }
    }

    // Invalidate cache after backfill if we added new rates
    if (results.length > 0) {
      this.invalidateCache();
    }

    this.logger.log(
      `Backfill complete. Inserted ${results.length} exchange rates`,
    );
    return results;
  }

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

    for (const snapshot of snapshots) {
      const snapshotCurrency = snapshot.currentBalance.currency;

      // Skip if currencies are the same
      if (snapshotCurrency === userCurrency) {
        continue;
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
    }

    return Array.from(pairsMap.values()).map((p) => ({
      baseCurrency: p.base,
      targetCurrency: p.target,
      earliestDate: p.earliestDate,
    }));
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
  private async fetchTimeSeriesRatesBatched(
    baseCurrency: string,
    targetCurrencies: string[],
    startDate: string,
    endDate: string,
  ): Promise<Map<string, Map<string, number>>> {
    const symbols = targetCurrencies.join(',');
    const url = `https://api.frankfurter.dev/v1/${startDate}..${endDate}?base=${baseCurrency}&symbols=${symbols}`;

    console.log('url', url);

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
    for (const [date, currencyRates] of Object.entries(data.rates)) {
      const dateRates = new Map<string, number>();
      for (const [currency, rate] of Object.entries(currencyRates)) {
        dateRates.set(currency, rate);
      }
      rates.set(date, dateRates);
    }

    this.logger.log(
      `Fetched ${rates.size} dates of rates for ${baseCurrency}→[${symbols}]`,
    );

    return rates;
  }
}
