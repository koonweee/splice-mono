import { Module, type DynamicModule } from '@nestjs/common';
import { CryptoBalanceService } from './crypto-balance.service';
import { CryptoExchangeRateService } from './crypto-exchange-rate.service';
import { CoinGeckoExchangeRateProvider } from './providers/coingecko-exchange-rate.provider';
import {
  type CryptoBalanceConfig,
  DEFAULT_CRYPTO_BALANCE_CONFIG,
} from './crypto-balance.config';

export const CRYPTO_BALANCE_CONFIG = 'CRYPTO_BALANCE_CONFIG';

@Module({})
export class CryptoModule {
  /**
   * Configure the crypto module with optional custom settings
   * @param config - Partial configuration to override defaults
   */
  static forRoot(config?: Partial<CryptoBalanceConfig>): DynamicModule {
    const mergedConfig: CryptoBalanceConfig = {
      ...DEFAULT_CRYPTO_BALANCE_CONFIG,
      ...config,
    };

    return {
      module: CryptoModule,
      providers: [
        {
          provide: CRYPTO_BALANCE_CONFIG,
          useValue: mergedConfig,
        },
        CryptoBalanceService,
        CoinGeckoExchangeRateProvider,
        CryptoExchangeRateService,
      ],
      exports: [CryptoBalanceService, CryptoExchangeRateService],
    };
  }
}
