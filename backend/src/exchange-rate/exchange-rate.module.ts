import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { UserEntity } from '../user/user.entity';
import { CurrencyConversionService } from './currency-conversion.service';
import { ExchangeRateController } from './exchange-rate.controller';
import { ExchangeRateEntity } from './exchange-rate.entity';
import { ExchangeRateScheduledService } from './exchange-rate.scheduled';
import { ExchangeRateService } from './exchange-rate.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExchangeRateEntity, AccountEntity, UserEntity]),
  ],
  controllers: [ExchangeRateController],
  providers: [
    ExchangeRateService,
    ExchangeRateScheduledService,
    CurrencyConversionService,
  ],
  exports: [ExchangeRateService, CurrencyConversionService],
})
export class ExchangeRateModule {}
