import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import type {
  CreateExchangeRateDto,
  CurrencyPair,
  ExchangeRate,
} from '../types/ExchangeRate';
import { UserEntity } from '../user/user.entity';
import { ExchangeRateEntity } from './exchange-rate.entity';

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
   * Ensure cache is loaded, then return a synchronous lookup function.
   * Useful for batch operations where you want to avoid repeated async calls.
   *
   * @returns A synchronous function to look up rates from the loaded cache
   */
  async prepareForBatchLookup(): Promise<
    (
      baseCurrency: string,
      targetCurrency: string,
      rateDate?: string,
    ) => number | null
  > {
    await this.ensureCacheLoaded();

    return (
      baseCurrency: string,
      targetCurrency: string,
      rateDate?: string,
    ): number | null => {
      if (baseCurrency === targetCurrency) {
        return 1;
      }

      const { base, target, inverted } = normalizeCurrencyPair(
        baseCurrency,
        targetCurrency,
      );

      let rate: number | undefined;

      if (rateDate) {
        rate = this.rateCache.get(`${base}:${target}:${rateDate}`);
      } else {
        const cached = this.latestRateCache.get(`${base}:${target}`);
        rate = cached?.rate;
      }

      if (rate === undefined) {
        return null;
      }

      return inverted ? 1 / rate : rate;
    };
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
   * Optimizes API calls by grouping pairs by base currency and
   * fetching multiple target currencies in a single request.
   */
  async syncDailyRates(): Promise<ExchangeRate[]> {
    const today = new Date().toISOString().split('T')[0];
    const pairs = await this.getRequiredCurrencyPairs();
    const results: ExchangeRate[] = [];

    if (pairs.length === 0) {
      this.logger.log('No currency pairs to sync');
      return results;
    }

    this.logger.log(
      `Syncing exchange rates for ${pairs.length} currency pairs on ${today}`,
    );

    // Group pairs by base currency to minimize API calls
    const pairsByBase = new Map<string, string[]>();
    for (const pair of pairs) {
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
    this.invalidateCache();

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

      this.logger.debug(`Accounts: ${JSON.stringify(accounts)}`);

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
   * Fetch exchange rate from the Frankfurter API.
   * https://frankfurter.dev - Free, open-source currency data API.
   * No API keys or rate limits required.
   */
  private async fetchExchangeRate(
    baseCurrency: string,
    targetCurrency: string,
  ): Promise<number | null> {
    const url = `https://api.frankfurter.dev/v1/latest?base=${baseCurrency}&symbols=${targetCurrency}`;

    try {
      this.logger.log(
        `Fetching rate from Frankfurter: ${baseCurrency}→${targetCurrency}`,
      );

      const response = await fetch(url);

      if (!response.ok) {
        this.logger.error(
          `Frankfurter API error: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        base: string;
        date: string;
        rates: Record<string, number>;
      };

      const rate = data.rates[targetCurrency];

      if (rate === undefined) {
        this.logger.error(
          `Rate not found in response for ${baseCurrency}→${targetCurrency}`,
        );
        return null;
      }

      this.logger.log(
        `Fetched rate: 1 ${baseCurrency} = ${rate} ${targetCurrency} (date: ${data.date})`,
      );

      return rate;
    } catch (error) {
      this.logger.error(`Failed to fetch rate from Frankfurter: ${error}`);
      return null;
    }
  }

  /**
   * Fetch multiple exchange rates in a single API call.
   * Groups pairs by base currency to minimize API requests.
   */
  private async fetchExchangeRates(
    baseCurrency: string,
    targetCurrencies: string[],
  ): Promise<Map<string, number>> {
    const symbols = targetCurrencies.join(',');
    const url = `https://api.frankfurter.dev/v1/latest?base=${baseCurrency}&symbols=${symbols}`;
    const rates = new Map<string, number>();

    try {
      this.logger.log(
        `Fetching rates from Frankfurter: ${baseCurrency}→[${symbols}]`,
      );

      const response = await fetch(url);

      if (!response.ok) {
        this.logger.error(
          `Frankfurter API error: ${response.status} ${response.statusText}`,
        );
        return rates;
      }

      const data = (await response.json()) as {
        base: string;
        date: string;
        rates: Record<string, number>;
      };

      for (const [currency, rate] of Object.entries(data.rates)) {
        rates.set(currency, rate);
      }

      this.logger.log(
        `Fetched ${rates.size} rates for base ${baseCurrency} (date: ${data.date})`,
      );

      return rates;
    } catch (error) {
      this.logger.error(`Failed to fetch rates from Frankfurter: ${error}`);
      return rates;
    }
  }
}
