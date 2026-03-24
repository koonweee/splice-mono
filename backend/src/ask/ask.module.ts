import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { BalanceQueryModule } from '../balance-query/balance-query.module';
import { TransactionModule } from '../transaction/transaction.module';
import { AskController } from './ask.controller';
import { AskQueryService } from './ask-query.service';
import { AskService } from './ask.service';

@Module({
  imports: [
    AccountModule,
    BalanceQueryModule,
    TransactionModule,
    CurrencyExchangeModule,
  ],
  controllers: [AskController],
  providers: [AskService, AskQueryService],
  exports: [AskService, AskQueryService],
})
export class AskModule {}
