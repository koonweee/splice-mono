import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from '../category/category.entity';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { TransactionEntity } from '../transaction/transaction.entity';
import { TransactionAnalysisController } from './transaction-analysis.controller';
import { TransactionAnalysisService } from './transaction-analysis.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity, CategoryEntity]),
    CurrencyExchangeModule,
  ],
  controllers: [TransactionAnalysisController],
  providers: [TransactionAnalysisService],
})
export class TransactionAnalysisModule {}
