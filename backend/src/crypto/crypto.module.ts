import { Module, type DynamicModule } from '@nestjs/common';
import { CryptoBalanceService } from './crypto-balance.service';
import {
  CRYPTO_BALANCE_CONFIG,
  DEFAULT_CRYPTO_BALANCE_CONFIG,
  type CryptoBalanceConfig,
} from './crypto-balance.config';

/**
 * Module for crypto balance reading (blockchain interaction).
 * Exchange rate functionality has been moved to CurrencyExchangeModule.
 */
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
      ],
      exports: [CryptoBalanceService],
    };
  }
}
