import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { TransactionEntity } from '../transaction/transaction.entity';
import { TransactionAnalysisController } from './transaction-analysis.controller';
import { TransactionAnalysisService } from './transaction-analysis.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionEntity,
      AccountEntity,
      BalanceSnapshotEntity,
    ]),
    CurrencyExchangeModule,
  ],
  controllers: [TransactionAnalysisController],
  providers: [TransactionAnalysisService],
  exports: [TransactionAnalysisService],
})
export class TransactionAnalysisModule {}
