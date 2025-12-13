import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { UserEntity } from '../user/user.entity';
import { CurrencyBackfillService } from './currency-backfill.service';
import { CurrencyExchangeListener } from './currency-exchange.listener';
import { CurrencyExchangeScheduledService } from './currency-exchange.scheduled';
import { CurrencyExchangeService } from './currency-exchange.service';
import { ExchangeRateEntity } from './exchange-rate.entity';
import { CryptoExchangeRateProvider } from './providers/crypto-exchange-rate.provider';
import { FiatExchangeRateProvider } from './providers/fiat-exchange-rate.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExchangeRateEntity,
      AccountEntity,
      UserEntity,
      BalanceSnapshotEntity,
    ]),
  ],
  providers: [
    // Providers (pure API callers)
    FiatExchangeRateProvider,
    CryptoExchangeRateProvider,

    // Services
    CurrencyExchangeService,
    CurrencyBackfillService,

    // Infrastructure
    CurrencyExchangeScheduledService,
    CurrencyExchangeListener,
  ],
  exports: [CurrencyExchangeService, CurrencyBackfillService],
})
export class CurrencyExchangeModule {}
