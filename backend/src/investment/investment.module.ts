import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountActivityModule } from '../account-activity/account-activity.module';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { MarketPriceModule } from '../market-price/market-price.module';
import { UserModule } from '../user/user.module';
import { InvestmentController } from './investment.controller';
import { InvestmentHoldingSnapshotEntity } from './investment-holding-snapshot.entity';
import { InvestmentSecurityEntity } from './investment-security.entity';
import { InvestmentService } from './investment.service';
import { InvestmentTransactionEntity } from './investment-transaction.entity';
import { ManualBrokerageService } from './manual-brokerage.service';
import { ManualBrokerageScheduledService } from './manual-brokerage.scheduled';

@Module({
  imports: [
    AccountActivityModule,
    CurrencyExchangeModule,
    MarketPriceModule,
    UserModule,
    TypeOrmModule.forFeature([
      AccountEntity,
      InvestmentHoldingSnapshotEntity,
      InvestmentSecurityEntity,
      InvestmentTransactionEntity,
      BalanceSnapshotEntity,
    ]),
  ],
  controllers: [InvestmentController],
  providers: [
    InvestmentService,
    ManualBrokerageService,
    ManualBrokerageScheduledService,
  ],
  exports: [InvestmentService, ManualBrokerageService],
})
export class InvestmentModule {}
