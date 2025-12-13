import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { Repository } from 'typeorm';
import type {
  CreateExchangeRateDto,
  CurrencyPair,
  DateRangeRateResponse,
  ExchangeRate,
  RateWithSource,
} from '../types/ExchangeRate';
import { ExchangeRateEntity } from './exchange-rate.entity';
import type { ICurrencyRateProvider } from './providers/currency-rate-provider.interface';
import { CryptoExchangeRateProvider } from './providers/crypto-exchange-rate.provider';
import { FiatExchangeRateProvider } from './providers/fiat-exchange-rate.provider';
import {
  isCryptoCurrency,
  normalizeCurrencyPair,
} from './utils/currency-pair.utils';

@Injectable()
export class CurrencyExchangeService {
  private readonly logger = new Logger(CurrencyExchangeService.name);

  constructor(
    @InjectRepository(ExchangeRateEntity)
    private repository: Repository<ExchangeRateEntity>,
    private readonly fiatProvider: FiatExchangeRateProvider,
    private readonly cryptoProvider: CryptoExchangeRateProvider,
  ) {}

  // ============================================================
  // PROVIDER ROUTING
  // ============================================================

  /**
   * Get the appropriate provider for a currency.
   */
  getProviderForCurrency(currency: string): ICurrencyRateProvider {
    return isCryptoCurrency(currency) ? this.cryptoProvider : this.fiatProvider;
  }

  /**
   * Get the FIAT exchange rate provider.
   */
  getFiatProvider(): FiatExchangeRateProvider {
    return this.fiatProvider;
  }

  /**
   * Get the Crypto exchange rate provider.
   */
  getCryptoProvider(): CryptoExchangeRateProvider {
    return this.cryptoProvider;
  }

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

    // Query rates within the date range
    const entitiesInRange = await this.repository
      .createQueryBuilder('rate')
      .where('rate.baseCurrency IN (:...bases)', { bases: normalizedBases })
      .andWhere('rate.targetCurrency IN (:...targets)', {
        targets: normalizedTargets,
      })
      .andWhere('rate.rateDate >= :startDate', { startDate })
      .andWhere('rate.rateDate <= :endDate', { endDate })
      .orderBy('rate.rateDate', 'ASC')
      .getMany();

    // For fill-forward: get the most recent rate before startDate for each pair
    const priorRates = await this.repository
      .createQueryBuilder('rate')
      .distinctOn(['rate.baseCurrency', 'rate.targetCurrency'])
      .where('rate.baseCurrency IN (:...bases)', { bases: normalizedBases })
      .andWhere('rate.targetCurrency IN (:...targets)', {
        targets: normalizedTargets,
      })
      .andWhere('rate.rateDate < :startDate', { startDate })
      .orderBy('rate.baseCurrency')
      .addOrderBy('rate.targetCurrency')
      .addOrderBy('rate.rateDate', 'DESC')
      .getMany();

    // For fill-backward: get the earliest rate after endDate for each pair (fallback)
    const futureRates = await this.repository
      .createQueryBuilder('rate')
      .distinctOn(['rate.baseCurrency', 'rate.targetCurrency'])
      .where('rate.baseCurrency IN (:...bases)', { bases: normalizedBases })
      .andWhere('rate.targetCurrency IN (:...targets)', {
        targets: normalizedTargets,
      })
      .andWhere('rate.rateDate > :endDate', { endDate })
      .orderBy('rate.baseCurrency')
      .addOrderBy('rate.targetCurrency')
      .addOrderBy('rate.rateDate', 'ASC')
      .getMany();

    const entities = [...priorRates, ...entitiesInRange, ...futureRates];

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
          }))
          .sort((a, b) => a.date.localeCompare(b.date));
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

  /**
   * Get a single exchange rate for a currency pair.
   * First checks the database, then fetches from the appropriate provider if not found.
   *
   * @param baseCurrency - Source currency
   * @param targetCurrency - Target currency
   * @param date - Optional date (YYYY-MM-DD). If not provided, uses today.
   * @returns Exchange rate as a number
   */
  async getRate(
    baseCurrency: string,
    targetCurrency: string,
    date?: string,
  ): Promise<number> {
    const rateDate = date ?? dayjs().format('YYYY-MM-DD');

    // Normalize the pair
    const { base, target, inverted } = normalizeCurrencyPair(
      baseCurrency,
      targetCurrency,
    );

    // Check database first
    const existing = await this.repository.findOne({
      where: {
        baseCurrency: base,
        targetCurrency: target,
        rateDate,
      },
    });

    if (existing) {
      const rate =
        typeof existing.rate === 'string'
          ? parseFloat(existing.rate)
          : existing.rate;
      return inverted ? 1 / rate : rate;
    }

    // Fetch from provider
    const provider = this.getProviderForCurrency(baseCurrency);
    const fetchedRate = await provider.getRate(base, target, rateDate);

    // Store in database
    await this.upsertRate({
      baseCurrency: base,
      targetCurrency: target,
      rate: fetchedRate,
      rateDate,
    });

    return inverted ? 1 / fetchedRate : fetchedRate;
  }

  // ============================================================
  // STORAGE METHODS (used by BackfillService)
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
