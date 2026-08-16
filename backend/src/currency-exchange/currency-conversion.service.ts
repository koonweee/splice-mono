import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CurrencyPair } from '../types/ExchangeRate';
import { getDecimalPlaces } from '../types/MoneyWithSign';
import { UserService } from '../user/user.service';
import { CurrencyExchangeService } from './currency-exchange.service';

@Injectable()
export class CurrencyConversionService {
  constructor(
    private currencyExchangeService: CurrencyExchangeService,
    private userService: UserService,
  ) {}

  /**
   * Get the user's preferred currency, defaulting to USD.
   */
  async getPreferredCurrency(userId: string): Promise<string> {
    const user = await this.userService.findOne(userId);
    return user?.settings?.currency ?? 'USD';
  }

  /**
   * Build a rate map for converting a set of source currencies to a target currency
   * at a given reference date.
   *
   * @returns Map from source currency code to exchange rate
   */
  async getRateMap(
    sourceCurrencies: string[],
    targetCurrency: string,
    referenceDate: string,
  ): Promise<Map<string, number>> {
    const rateMap = new Map<string, number>();
    const uniqueSourceCurrencies = [...new Set(sourceCurrencies)];
    if (uniqueSourceCurrencies.length === 0) {
      return rateMap;
    }

    const pairs: CurrencyPair[] = uniqueSourceCurrencies.map((currency) => ({
      baseCurrency: currency,
      targetCurrency,
    }));

    const rateResponses =
      await this.currencyExchangeService.getRatesForDateRange(
        pairs,
        referenceDate,
        referenceDate,
      );

    if (rateResponses.length > 0) {
      rateResponses[0].rates.forEach((rate) => {
        rateMap.set(rate.baseCurrency, rate.rate);
      });
    }

    const missingCurrency = uniqueSourceCurrencies.find((currency) => {
      const rate = rateMap.get(currency);
      return rate === undefined || !Number.isFinite(rate) || rate <= 0;
    });
    if (missingCurrency) {
      throw new ServiceUnavailableException(
        `Required exchange rate is unavailable for ${missingCurrency} to ${targetCurrency} on ${referenceDate}`,
      );
    }

    return rateMap;
  }

  /**
   * Convert an amount in smallest currency units from one currency to another
   * using a pre-fetched exchange rate.
   *
   * @param amount - Amount in smallest units (e.g. cents)
   * @param sourceCurrency - Source currency code
   * @param targetCurrency - Target currency code
   * @param rate - Exchange rate (1 source = rate target)
   * @returns Converted amount in smallest units of the target currency
   */
  convertAmount(
    amount: number,
    sourceCurrency: string,
    targetCurrency: string,
    rate: number,
  ): number {
    const sourceDecimals = getDecimalPlaces(sourceCurrency);
    const targetDecimals = getDecimalPlaces(targetCurrency);
    const majorUnits = amount / Math.pow(10, sourceDecimals);
    return Math.round(majorUnits * rate * Math.pow(10, targetDecimals));
  }
}
