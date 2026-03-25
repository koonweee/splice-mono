import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { TransactionEntity } from '../transaction/transaction.entity';
import { TransactionAnalysisController } from './transaction-analysis.controller';
import { CashflowAnalysisSurfaceService } from './cashflow-analysis-surface.service';
import { TransactionAnalysisService } from './transaction-analysis.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity]),
    CurrencyExchangeModule,
  ],
  controllers: [TransactionAnalysisController],
  providers: [TransactionAnalysisService, CashflowAnalysisSurfaceService],
  exports: [TransactionAnalysisService, CashflowAnalysisSurfaceService],
})
export class TransactionAnalysisModule {}
