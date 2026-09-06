import { ExactDecimal, decimalRateRatio } from '../common/exact-money';
import { assertDateRange } from '../common/query-bounds';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { Repository, type EntityManager } from 'typeorm';
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

export function buildExchangeRateKey(
  baseCurrency: string,
  targetCurrency: string,
  rateDate: string,
): string {
  const normalized = normalizeCurrencyPair(baseCurrency, targetCurrency);
  return `${normalized.base}:${normalized.target}:${rateDate}`;
}

export type FxRequest = CurrencyPair & { requestedDate: string };
export function fxRequestKey(request: FxRequest): string {
  return `${request.baseCurrency.toUpperCase()}:${request.targetCurrency.toUpperCase()}:${request.requestedDate}`;
}

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
    manager?: EntityManager,
  ): Promise<DateRangeRateResponse[]> {
    assertDateRange(startDate, endDate, { maxDays: 10_000 });
    if (pairs.length === 0) return [];
    const requests: FxRequest[] = [];
    const dates: string[] = [];
    for (
      let date = dayjs(startDate);
      date.format('YYYY-MM-DD') <= endDate;
      date = date.add(1, 'day')
    ) {
      const requestedDate = date.format('YYYY-MM-DD');
      dates.push(requestedDate);
      for (const pair of pairs) requests.push({ ...pair, requestedDate });
    }
    const resolved = await this.resolveRequests(requests, manager);
    return dates.map((date) => ({
      date,
      rates: pairs.map(
        (pair) => resolved.get(fxRequestKey({ ...pair, requestedDate: date }))!,
      ),
    }));
  }

  /** Resolve only requested pair/dates in one indexed query; sparse dates never expand to a daily grid. */
  async resolveRequests(
    requests: FxRequest[],
    manager?: EntityManager,
    options: { allowMissing?: boolean } = {},
  ): Promise<Map<string, RateWithSource>> {
    if (requests.length > 1_000_000)
      throw new BadRequestException(
        'FX request exceeds 1,000,000 pair-dates; request a shorter range',
      );
    const unique = new Map<string, FxRequest>();
    const normalized = new Map<
      string,
      { base: string; target: string; date: string }
    >();
    for (const request of requests) {
      assertDateRange(request.requestedDate, request.requestedDate);
      const clean = {
        ...request,
        baseCurrency: request.baseCurrency.toUpperCase(),
        targetCurrency: request.targetCurrency.toUpperCase(),
      };
      unique.set(fxRequestKey(clean), clean);
      if (clean.baseCurrency === clean.targetCurrency) continue;
      const pair = normalizeCurrencyPair(
        clean.baseCurrency,
        clean.targetCurrency,
      );
      normalized.set(`${pair.base}:${pair.target}:${clean.requestedDate}`, {
        base: pair.base,
        target: pair.target,
        date: clean.requestedDate,
      });
    }
    type RateRow = {
      base: string;
      target: string;
      date: string;
      rate: string | null;
      rateDate: string | null;
    };
    const rows: RateRow[] =
      normalized.size === 0
        ? []
        : await (manager ?? this.repository.manager).query(
            `
      WITH requested AS (
        SELECT DISTINCT base, target, date FROM jsonb_to_recordset($1::jsonb) AS input(base text, target text, date date)
      )
      SELECT requested.base, requested.target, requested.date::text,
        COALESCE(prior.rate, future.rate)::text AS rate,
        COALESCE(prior."rateDate", future."rateDate")::text AS "rateDate"
      FROM requested
      LEFT JOIN LATERAL (
        SELECT rate, "rateDate" FROM exchange_rate_entity
        WHERE "baseCurrency" = requested.base AND "targetCurrency" = requested.target AND "rateDate" <= requested.date
        ORDER BY "rateDate" DESC LIMIT 1
      ) prior ON true
      LEFT JOIN LATERAL (
        SELECT rate, "rateDate" FROM exchange_rate_entity
        WHERE prior.rate IS NULL AND "baseCurrency" = requested.base AND "targetCurrency" = requested.target AND "rateDate" > requested.date
        ORDER BY "rateDate" ASC LIMIT 1
      ) future ON true
    `,
            [JSON.stringify([...normalized.values()])],
          );
    const found = new Map(
      rows.map((row) => [`${row.base}:${row.target}:${row.date}`, row]),
    );
    const result = new Map<string, RateWithSource>();
    for (const [key, request] of unique) {
      if (request.baseCurrency === request.targetCurrency) {
        result.set(key, {
          ...request,
          rateDate: request.requestedDate,
          rate: '1',
          source: 'IDENTITY',
          ratio: { numerator: '1', denominator: '1' },
        });
        continue;
      }
      const pair = normalizeCurrencyPair(
        request.baseCurrency,
        request.targetCurrency,
      );
      const row = found.get(
        `${pair.base}:${pair.target}:${request.requestedDate}`,
      );
      if (
        !row?.rate ||
        !row.rateDate ||
        !new ExactDecimal(row.rate).isPositive()
      ) {
        if (options.allowMissing) continue;
        throw new ServiceUnavailableException(
          `Required exchange rate is unavailable for ${request.baseCurrency} to ${request.targetCurrency} on ${request.requestedDate}`,
        );
      }
      const ratio = decimalRateRatio(row.rate, pair.inverted);
      result.set(key, {
        ...request,
        rateDate: row.rateDate,
        ratio,
        rate: new ExactDecimal(ratio.numerator)
          .div(ratio.denominator)
          .toFixed(),
        source:
          row.rateDate === request.requestedDate
            ? 'DB'
            : row.rateDate < request.requestedDate
              ? 'FORWARD_FILLED'
              : 'BACKWARD_FILLED',
      });
    }
    return result;
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
  ): Promise<string> {
    const rateDate = date ?? dayjs().format('YYYY-MM-DD');
    assertDateRange(rateDate, rateDate);
    if (baseCurrency.toUpperCase() === targetCurrency.toUpperCase()) return '1';
    const { base, target, inverted } = normalizeCurrencyPair(
      baseCurrency,
      targetCurrency,
    );
    let existing = await this.repository.findOne({
      where: { baseCurrency: base, targetCurrency: target, rateDate },
    });
    if (!existing) {
      const fetched = await this.getProviderForCurrency(baseCurrency).getRate(
        base,
        target,
        rateDate,
      );
      const stored = await this.upsertRate({
        baseCurrency: base,
        targetCurrency: target,
        rate: new ExactDecimal(String(fetched)).toFixed(),
        rateDate,
      });
      existing = ExchangeRateEntity.fromDto(stored);
    }
    return (
      inverted
        ? new ExactDecimal(1).div(existing.rate)
        : new ExactDecimal(existing.rate)
    ).toFixed();
  }

  // ============================================================
  // STORAGE METHODS (used by BackfillService)
  // ============================================================

  /**
   * Create or update an exchange rate for a specific date.
   * Normalizes the currency pair alphabetically before storing.
   */
  async upsertRate(dto: CreateExchangeRateDto): Promise<ExchangeRate> {
    assertDateRange(dto.rateDate, dto.rateDate);
    const { base, target, inverted } = normalizeCurrencyPair(
      dto.baseCurrency,
      dto.targetCurrency,
    );
    const input = new ExactDecimal(dto.rate);
    if (!input.isFinite() || !input.isPositive())
      throw new BadRequestException(
        'Exchange rate must be positive decimal text',
      );
    const normalized = inverted ? new ExactDecimal(1).div(input) : input;
    const rate = normalized.toFixed(10);
    if (
      !new ExactDecimal(rate).isPositive() ||
      new ExactDecimal(rate).gte('10000000000')
    ) {
      throw new BadRequestException(
        'Exchange rate is outside supported storage precision',
      );
    }
    await this.repository.upsert(
      {
        baseCurrency: base,
        targetCurrency: target,
        rate,
        rateDate: dto.rateDate,
      },
      ['baseCurrency', 'targetCurrency', 'rateDate'],
    );
    const saved = await this.repository.findOneOrFail({
      where: {
        baseCurrency: base,
        targetCurrency: target,
        rateDate: dto.rateDate,
      },
    });
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
   * @returns Set of canonical "baseCurrency:targetCurrency:date" keys
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

    // Return canonical stored pair identities so callers can safely union
    // results from more than one base currency.
    const existingKeys = new Set<string>();

    entities.forEach((entity) => {
      existingKeys.add(
        buildExchangeRateKey(
          entity.baseCurrency,
          entity.targetCurrency,
          entity.rateDate,
        ),
      );
    });

    return existingKeys;
  }
}
