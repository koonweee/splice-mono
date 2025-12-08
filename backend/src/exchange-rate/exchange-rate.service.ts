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
  ) {}

  /**
   * Create or update an exchange rate for a specific date.
   * Normalizes the currency pair alphabetically before storing.
   */
  async upsert(dto: CreateExchangeRateDto): Promise<ExchangeRate> {
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
   * Get the exchange rate for a currency pair on a specific date.
   * Automatically handles inverse pairs - if you request USD→SGD but we have SGD→USD stored,
   * it will return the computed inverse rate.
   *
   * @returns ExchangeRate with the requested base/target currencies (may be computed inverse)
   */
  async getRate(
    baseCurrency: string,
    targetCurrency: string,
    rateDate: string,
  ): Promise<ExchangeRate | null> {
    // Same currency - rate is always 1
    if (baseCurrency === targetCurrency) {
      return null;
    }

    // Normalize to find the stored pair
    const { base, target, inverted } = normalizeCurrencyPair(
      baseCurrency,
      targetCurrency,
    );

    const entity = await this.repository.findOne({
      where: { baseCurrency: base, targetCurrency: target, rateDate },
    });

    if (!entity) {
      return null;
    }

    const storedRate = entity.toObject();

    // If we need the inverse, compute it and swap currencies in the response
    if (inverted) {
      return {
        ...storedRate,
        baseCurrency,
        targetCurrency,
        rate: 1 / storedRate.rate,
      };
    }

    return storedRate;
  }

  /**
   * Get the latest exchange rate for a currency pair.
   * Automatically handles inverse pairs - if you request USD→SGD but we have SGD→USD stored,
   * it will return the computed inverse rate.
   *
   * @returns ExchangeRate with the requested base/target currencies (may be computed inverse)
   */
  async getLatestRate(
    baseCurrency: string,
    targetCurrency: string,
  ): Promise<ExchangeRate | null> {
    // Same currency - rate is always 1
    if (baseCurrency === targetCurrency) {
      return null;
    }

    // Normalize to find the stored pair
    const { base, target, inverted } = normalizeCurrencyPair(
      baseCurrency,
      targetCurrency,
    );

    const entity = await this.repository.findOne({
      where: { baseCurrency: base, targetCurrency: target },
      order: { rateDate: 'DESC' },
    });

    if (!entity) {
      return null;
    }

    const storedRate = entity.toObject();

    // If we need the inverse, compute it and swap currencies in the response
    if (inverted) {
      return {
        ...storedRate,
        baseCurrency,
        targetCurrency,
        rate: 1 / storedRate.rate,
      };
    }

    return storedRate;
  }

  /**
   * Get all exchange rates for a specific date
   */
  async getRatesForDate(rateDate: string): Promise<ExchangeRate[]> {
    const entities = await this.repository.find({
      where: { rateDate },
    });
    return entities.map((e) => e.toObject());
  }

  /**
   * Determine which currency pairs need to be tracked based on all users and their accounts.
   * Returns unique normalized pairs (alphabetically sorted) where the user's currency
   * differs from the account's currency.
   *
   * Pairs are normalized so we only fetch each unique pair once, regardless of direction.
   * For example, if one user needs USD→SGD and another needs SGD→USD, we only return
   * one pair (SGD→USD, alphabetically sorted).
   */
  async getRequiredCurrencyPairs(): Promise<CurrencyPair[]> {
    // Get all users with their currency setting
    const users = await this.userRepository.find({
      select: ['id', 'currency'],
    });

    const pairsSet = new Set<string>();
    const pairs: CurrencyPair[] = [];

    for (const user of users) {
      const userCurrency = user.currency;

      // Get all accounts for this user
      const accounts = await this.accountRepository.find({
        where: { userId: user.id },
        select: ['id', 'currentBalance'],
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

  /**
   * Fetch exchange rate from the Frankfurter API.
   * https://frankfurter.dev - Free, open-source currency data API.
   * No API keys or rate limits required.
   *
   * @param baseCurrency - The base currency (e.g., 'EUR')
   * @param targetCurrency - The target currency (e.g., 'USD')
   * @returns The exchange rate (1 base = X target), or null if fetch failed
   */
  async fetchExchangeRate(
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
   *
   * @param baseCurrency - The base currency
   * @param targetCurrencies - Array of target currencies
   * @returns Map of target currency to rate
   */
  async fetchExchangeRates(
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
          const exchangeRate = await this.upsert({
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

    this.logger.log(`Synced ${results.length} exchange rates`);
    return results;
  }
}
