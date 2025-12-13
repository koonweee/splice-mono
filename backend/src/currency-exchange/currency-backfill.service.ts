import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import type { BalanceSnapshot } from '../types/BalanceSnapshot';
import type { CurrencyPair, ExchangeRate } from '../types/ExchangeRate';
import { UserEntity } from '../user/user.entity';
import { CurrencyExchangeService } from './currency-exchange.service';
import {
  CRYPTO_CURRENCIES,
  isCryptoCurrency,
  normalizeCurrencyPair,
} from './utils/currency-pair.utils';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Currency pair with earliest date needed for backfill */
interface CurrencyPairWithDate extends CurrencyPair {
  earliestDate: string;
}

/**
 * Service responsible for all exchange rate backfill and sync operations.
 * - Scheduled sync jobs (daily FIAT, hourly crypto)
 * - User backfill when currency preference changes
 * - Snapshot-triggered rate fetching
 */
@Injectable()
export class CurrencyBackfillService {
  private readonly logger = new Logger(CurrencyBackfillService.name);

  constructor(
    private readonly currencyExchangeService: CurrencyExchangeService,
    @InjectRepository(AccountEntity)
    private accountRepository: Repository<AccountEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(BalanceSnapshotEntity)
    private balanceSnapshotRepository: Repository<BalanceSnapshotEntity>,
  ) {}

  // ============================================================
  // SCHEDULED SYNC METHODS
  // ============================================================

  /**
   * Sync all required FIAT exchange rates for today.
   * Called by daily scheduled job at 6 AM UTC.
   *
   * Optimizes API calls by:
   * 1. Skipping pairs that already have rates for today
   * 2. Grouping remaining pairs by base currency
   */
  async syncDailyFiatRates(): Promise<ExchangeRate[]> {
    const today = new Date().toISOString().split('T')[0];
    const allPairs = await this.getRequiredCurrencyPairs();

    // Filter to FIAT pairs only
    const fiatPairs = allPairs.filter(
      (pair) => !isCryptoCurrency(pair.baseCurrency),
    );
    const results: ExchangeRate[] = [];

    if (fiatPairs.length === 0) {
      this.logger.log({}, 'No FIAT currency pairs to sync');
      return results;
    }

    // Check which pairs already have rates for today
    const allBases = [...new Set(fiatPairs.map((p) => p.baseCurrency))];

    // Get existing keys for today only - check all bases in parallel
    const existingKeysPromises = allBases.map((baseCurrency) => {
      const basePairs = fiatPairs.filter(
        (p) => p.baseCurrency === baseCurrency,
      );
      const baseTargets = basePairs.map((p) => p.targetCurrency);
      return this.currencyExchangeService.getExistingRateKeys(
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
    const pairsToSync = fiatPairs.filter((pair) => {
      const key = `${pair.targetCurrency}:${today}`;
      return !existingKeys.has(key);
    });

    if (pairsToSync.length === 0) {
      this.logger.log(
        { count: fiatPairs.length, date: today },
        'All FIAT currency pairs already have rates for date',
      );
      return results;
    }

    this.logger.log(
      {
        pairsToSync: pairsToSync.length,
        date: today,
        alreadyExist: fiatPairs.length - pairsToSync.length,
      },
      'Syncing FIAT exchange rates for currency pairs',
    );

    // Group pairs by base currency to minimize API calls
    const pairsByBase = new Map<string, string[]>();
    pairsToSync.forEach((pair) => {
      const targets = pairsByBase.get(pair.baseCurrency) ?? [];
      targets.push(pair.targetCurrency);
      pairsByBase.set(pair.baseCurrency, targets);
    });

    const fiatProvider = this.currencyExchangeService.getFiatProvider();

    // Fetch rates for each base currency (one API call per base)
    for (const [baseCurrency, targetCurrencies] of pairsByBase) {
      try {
        const rates = await fiatProvider.getLatestRates(
          baseCurrency,
          targetCurrencies,
        );

        for (const [targetCurrency, rate] of rates) {
          const exchangeRate = await this.currencyExchangeService.upsertRate({
            baseCurrency,
            targetCurrency,
            rate,
            rateDate: today,
          });
          results.push(exchangeRate);
          this.logger.log(
            { baseCurrency, rate, targetCurrency },
            'Saved FIAT exchange rate',
          );
        }
      } catch (error) {
        this.logger.error(
          { baseCurrency, error: String(error) },
          'Error fetching rates for base currency',
        );
      }
    }

    this.logger.log({ count: results.length }, 'Synced FIAT exchange rates');
    return results;
  }

  /**
   * Sync cryptocurrency exchange rates for all required pairs.
   * Fetches rates based on users' crypto accounts and their preferred currencies.
   * Called by hourly scheduled job at :05.
   *
   * @returns Array of synced exchange rates
   */
  async syncHourlyCryptoRates(): Promise<ExchangeRate[]> {
    const today = new Date().toISOString().split('T')[0];
    const results: ExchangeRate[] = [];

    // Get all required currency pairs and filter to crypto base currencies
    const allPairs = await this.getRequiredCurrencyPairs();
    const cryptoPairs = allPairs.filter((pair) =>
      CRYPTO_CURRENCIES.includes(
        pair.baseCurrency as (typeof CRYPTO_CURRENCIES)[number],
      ),
    );

    if (cryptoPairs.length === 0) {
      this.logger.log({}, 'No crypto currency pairs to sync');
      return results;
    }

    this.logger.log(
      { pairCount: cryptoPairs.length, date: today },
      'Syncing crypto exchange rates',
    );

    const cryptoProvider = this.currencyExchangeService.getCryptoProvider();

    // Fetch rates for each unique crypto → fiat pair
    for (const pair of cryptoPairs) {
      try {
        const rate = await cryptoProvider.getRate(
          pair.baseCurrency,
          pair.targetCurrency,
        );

        if (rate === 0) {
          this.logger.warn(
            {
              baseCurrency: pair.baseCurrency,
              targetCurrency: pair.targetCurrency,
            },
            'Received zero exchange rate, skipping',
          );
          continue;
        }

        const exchangeRate = await this.currencyExchangeService.upsertRate({
          baseCurrency: pair.baseCurrency,
          targetCurrency: pair.targetCurrency,
          rate,
          rateDate: today,
        });

        results.push(exchangeRate);
        this.logger.log(
          {
            baseCurrency: pair.baseCurrency,
            targetCurrency: pair.targetCurrency,
            rate,
          },
          'Saved crypto exchange rate',
        );
      } catch (error) {
        this.logger.error(
          {
            baseCurrency: pair.baseCurrency,
            targetCurrency: pair.targetCurrency,
            error: String(error),
          },
          'Error fetching crypto exchange rate',
        );
      }
    }

    this.logger.log({ count: results.length }, 'Synced crypto exchange rates');
    return results;
  }

  // ============================================================
  // USER BACKFILL
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
          earliestDate: p.earliestDate,
        })),
      },
      'Found currency pairs to backfill',
    );

    // Group pairs by base currency for batched API requests
    const pairsByBase = new Map<
      string,
      { targets: string[]; earliestDate: string }
    >();

    pairs.forEach((pair) => {
      const existing = pairsByBase.get(pair.baseCurrency);
      if (existing) {
        existing.targets.push(pair.targetCurrency);
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

    // Fetch and upsert rates for each base currency
    for (const [baseCurrency, { targets, earliestDate }] of pairsByBase) {
      try {
        // Get all existing rates for this base currency and targets in one query
        const existingKeys =
          await this.currencyExchangeService.getExistingRateKeys(
            baseCurrency,
            targets,
            earliestDate,
            today,
          );

        // Check if all required keys already exist
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
              totalRates: requiredKeys.length,
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
            totalRates: requiredKeys.length,
          },
          'Fetching rates from API',
        );

        // Fetch rates from the appropriate provider
        const provider =
          this.currencyExchangeService.getProviderForCurrency(baseCurrency);
        const ratesByDateAndTarget = await provider.getHistoricalRates(
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

            const exchangeRate = await this.currencyExchangeService.upsertRate({
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
            skipped,
          },
          'Processed rates',
        );
      } catch (error) {
        this.logger.error(
          {
            baseCurrency,
            targetCurrencies: targets,
            error: error instanceof Error ? error.message : String(error),
          },
          'Error backfilling rates',
        );
      }
    }

    this.logger.log({ insertedCount: results.length }, 'Backfill complete');
    return results;
  }

  // ============================================================
  // SNAPSHOT-TRIGGERED RATE FETCHING
  // ============================================================

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

      // Fetch and store the rate using the appropriate provider
      const provider =
        this.currencyExchangeService.getProviderForCurrency(snapshotCurrency);
      const rate = await provider.getRate(
        snapshotCurrency,
        userCurrency,
        snapshotDate,
      );

      if (rate === 0) {
        this.logger.warn(
          { snapshotCurrency, userCurrency },
          'Received zero exchange rate',
        );
        return;
      }

      await this.currencyExchangeService.upsertRate({
        baseCurrency: snapshotCurrency,
        targetCurrency: userCurrency,
        rate,
        rateDate: snapshotDate,
      });

      this.logger.log(
        { snapshotCurrency, userCurrency, rate, snapshotDate },
        'Stored exchange rate for snapshot',
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

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Determine which currency pairs need to be tracked based on all users and their accounts.
   * Returns unique normalized pairs (alphabetically sorted) where the user's currency
   * differs from the account's currency.
   */
  private async getRequiredCurrencyPairs(): Promise<CurrencyPair[]> {
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

        // Normalize the pair to canonical form
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

  /**
   * Get unique currency pairs from a user's balance snapshots with their earliest dates.
   * Pairs are normalized (alphabetically sorted, USD always as target when involved).
   */
  private async getUniqueCurrencyPairsFromSnapshots(
    userId: string,
    userCurrency: string,
  ): Promise<CurrencyPairWithDate[]> {
    // Query snapshots ordered by date to find earliest per currency pair
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

      // Only store if we haven't seen this pair yet (earliest date wins)
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
   * Check if exchange rate exists for the given pair and date.
   */
  private async checkRateExists(
    baseCurrency: string,
    targetCurrency: string,
    rateDate: string,
  ): Promise<boolean> {
    const existingKeys = await this.currencyExchangeService.getExistingRateKeys(
      baseCurrency,
      [targetCurrency],
      rateDate,
      rateDate,
    );
    return existingKeys.size > 0;
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
