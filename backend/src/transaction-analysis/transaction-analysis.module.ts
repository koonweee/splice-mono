import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisRuleModule } from '../analysis-rule/analysis-rule.module';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { TransactionEntity } from '../transaction/transaction.entity';
import { UserModule } from '../user/user.module';
import { TransactionAnalysisController } from './transaction-analysis.controller';
import { TransactionAnalysisService } from './transaction-analysis.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity]),
    AnalysisRuleModule,
    CurrencyExchangeModule,
    UserModule,
  ],
  controllers: [TransactionAnalysisController],
  providers: [TransactionAnalysisService],
  exports: [TransactionAnalysisService],
})
export class TransactionAnalysisModule {}
