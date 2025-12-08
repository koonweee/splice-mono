import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { UserEntity } from '../user/user.entity';
import { CurrencyConversionService } from './currency-conversion.service';
import { ExchangeRateController } from './exchange-rate.controller';
import { ExchangeRateEntity } from './exchange-rate.entity';
import { ExchangeRateListener } from './exchange-rate.listener';
import { ExchangeRateScheduledService } from './exchange-rate.scheduled';
import { ExchangeRateService } from './exchange-rate.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExchangeRateEntity,
      AccountEntity,
      UserEntity,
      BalanceSnapshotEntity,
    ]),
  ],
  controllers: [ExchangeRateController],
  providers: [
    ExchangeRateService,
    ExchangeRateScheduledService,
    ExchangeRateListener,
    CurrencyConversionService,
  ],
  exports: [ExchangeRateService, CurrencyConversionService],
})
export class ExchangeRateModule {}
