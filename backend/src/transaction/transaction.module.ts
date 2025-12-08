import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { UserModule } from '../user/user.module';
import { TransactionController } from './transaction.controller';
import { TransactionEntity } from './transaction.entity';
import { TransactionListener } from './transaction.listener';
import { TransactionService } from './transaction.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity, AccountEntity]),
    UserModule, // For UserService (to get user's timezone)
  ],
  controllers: [TransactionController],
  providers: [TransactionService, TransactionListener],
  exports: [TransactionService],
})
export class TransactionModule {}
