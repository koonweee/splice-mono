import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { CategoryModule } from '../category/category.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UserEntity } from '../user/user.entity';
import { RecurringManualTransactionController } from './recurring-manual-transaction.controller';
import { RecurringManualTransactionOccurrenceEntity } from './recurring-manual-transaction-occurrence.entity';
import { RecurringManualTransactionScheduleEntity } from './recurring-manual-transaction-schedule.entity';
import { RecurringManualTransactionScheduledService } from './recurring-manual-transaction.scheduled';
import { RecurringManualTransactionService } from './recurring-manual-transaction.service';

@Module({
  imports: [
    CategoryModule,
    TransactionModule,
    TypeOrmModule.forFeature([
      AccountEntity,
      UserEntity,
      RecurringManualTransactionScheduleEntity,
      RecurringManualTransactionOccurrenceEntity,
    ]),
  ],
  controllers: [RecurringManualTransactionController],
  providers: [
    RecurringManualTransactionService,
    RecurringManualTransactionScheduledService,
  ],
  exports: [RecurringManualTransactionService],
})
export class RecurringManualTransactionModule {}
