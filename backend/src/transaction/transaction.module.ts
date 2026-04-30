import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from '../category/category.entity';
import { TransactionController } from './transaction.controller';
import { TransactionEntity } from './transaction.entity';
import { TransactionsSurfaceService } from './transactions-surface.service';
import { TransactionService } from './transaction.service';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionEntity, CategoryEntity])],
  controllers: [TransactionController],
  providers: [TransactionService, TransactionsSurfaceService],
  exports: [TransactionService, TransactionsSurfaceService],
})
export class TransactionModule {}
