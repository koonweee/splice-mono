import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryModule } from '../category/category.module';
import { CategoryEntity } from '../category/category.entity';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { TransactionController } from './transaction.controller';
import { TransactionEntity } from './transaction.entity';
import { TransactionsSurfaceService } from './transactions-surface.service';
import { TransactionService } from './transaction.service';

@Module({
  imports: [
    CategoryModule,
    TypeOrmModule.forFeature([TransactionEntity, CategoryEntity]),
    CurrencyExchangeModule,
  ],
  controllers: [TransactionController],
  providers: [TransactionService, TransactionsSurfaceService],
  exports: [TransactionService, TransactionsSurfaceService],
})
export class TransactionModule {}
