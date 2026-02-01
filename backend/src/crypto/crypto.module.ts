import { Module, type DynamicModule } from '@nestjs/common';
import { CryptoBalanceService } from './crypto-balance.service';
import {
  CRYPTO_BALANCE_CONFIG,
  type CryptoBalanceConfig,
} from './crypto-balance.config';

/**
 * Module for crypto balance reading (blockchain interaction).
 * Exchange rate functionality has been moved to CurrencyExchangeModule.
 */
@Module({})
export class CryptoModule {
  /**
   * Configure the crypto module with required settings
   * @param config - Configuration including Alchemy API key
   */
  static forRoot(config: CryptoBalanceConfig): DynamicModule {
    return {
      module: CryptoModule,
      providers: [
        {
          provide: CRYPTO_BALANCE_CONFIG,
          useValue: config,
        },
        CryptoBalanceService,
      ],
      exports: [CryptoBalanceService],
    };
  }
}
