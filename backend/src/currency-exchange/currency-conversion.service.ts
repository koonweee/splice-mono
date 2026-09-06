import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { convertMinorUnits, type ExactRateRatio } from '../common/exact-money';
import type { RateWithSource } from '../types/ExchangeRate';
import { UserService } from '../user/user.service';
import { UserEntity } from '../user/user.entity';
import {
  CurrencyExchangeService,
  fxRequestKey,
  type FxRequest,
} from './currency-exchange.service';

@Injectable()
export class CurrencyConversionService {
  constructor(
    private currencyExchangeService: CurrencyExchangeService,
    private userService: UserService,
  ) {}

  async getPreferredCurrency(
    userId: string,
    manager?: EntityManager,
  ): Promise<string> {
    if (manager) {
      const user = await manager
        .getRepository(UserEntity)
        .findOne({ where: { id: userId }, select: { settings: true } });
      return user?.settings?.currency ?? 'USD';
    }
    return this.userService.getPreferredCurrency(userId);
  }

  async getResolvedRates(
    requests: FxRequest[],
    manager?: EntityManager,
    options: { allowMissing?: boolean } = {},
  ): Promise<Map<string, RateWithSource>> {
    return this.currencyExchangeService.resolveRequests(
      requests,
      manager,
      options,
    );
  }

  /** Single-date adapter; multi-date callers should reuse getResolvedRates once per request. */
  async getRateMap(
    sourceCurrencies: string[],
    targetCurrency: string,
    referenceDate: string,
  ): Promise<Map<string, string>> {
    const requests = [...new Set(sourceCurrencies)].map((baseCurrency) => ({
      baseCurrency,
      targetCurrency,
      requestedDate: referenceDate,
    }));
    const resolved = await this.getResolvedRates(requests);
    return new Map(
      requests.map((request) => [
        request.baseCurrency,
        resolved.get(fxRequestKey(request))!.rate,
      ]),
    );
  }

  convertAmount(
    amount: string,
    sourceCurrency: string,
    targetCurrency: string,
    rate: string | ExactRateRatio,
  ): string {
    return convertMinorUnits(amount, sourceCurrency, targetCurrency, rate);
  }
}
