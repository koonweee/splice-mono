import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { UserModule } from '../user/user.module';
import { AccountController } from './account.controller';
import { AccountEntity } from './account.entity';
import { AccountService } from './account.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountEntity]),
    UserModule, // For UserService (to get user's preferred currency)
    ExchangeRateModule, // For CurrencyConversionService
  ],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
