import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { TransactionController } from './transaction.controller';
import { TransactionEntity } from './transaction.entity';
import { TransactionListener } from './transaction.listener';
import { TransactionService } from './transaction.service';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionEntity, AccountEntity])],
  controllers: [TransactionController],
  providers: [TransactionService, TransactionListener],
  exports: [TransactionService],
})
export class TransactionModule {}
