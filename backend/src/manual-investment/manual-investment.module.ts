import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountModule } from '../account/account.module';
import { BalanceSnapshotModule } from '../balance-snapshot/balance-snapshot.module';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { UserModule } from '../user/user.module';
import { ManualInvestmentHoldingEntity } from './manual-investment-holding.entity';
import { ManualInvestmentController } from './manual-investment.controller';
import { ManualInvestmentSnapshotEntity } from './manual-investment-snapshot.entity';
import { ManualInvestmentService } from './manual-investment.service';
import { SecurityInstrumentEntity } from './security-instrument.entity';
import { SecurityPriceDailyEntity } from './security-price-daily.entity';
import { StooqSecurityPriceProvider } from './providers/stooq-security-price.provider';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      BalanceSnapshotEntity,
      ManualInvestmentSnapshotEntity,
      ManualInvestmentHoldingEntity,
      SecurityInstrumentEntity,
      SecurityPriceDailyEntity,
    ]),
    AccountModule,
    BalanceSnapshotModule,
    CurrencyExchangeModule,
    UserModule,
  ],
  controllers: [ManualInvestmentController],
  providers: [
    ManualInvestmentService,
    StooqSecurityPriceProvider,
  ],
  exports: [ManualInvestmentService],
})
export class ManualInvestmentModule {}
