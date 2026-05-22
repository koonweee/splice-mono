import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountActivityModule } from '../account-activity/account-activity.module';
import { AccountEntity } from '../account/account.entity';
import { InvestmentController } from './investment.controller';
import { InvestmentHoldingSnapshotEntity } from './investment-holding-snapshot.entity';
import { InvestmentSecurityEntity } from './investment-security.entity';
import { InvestmentService } from './investment.service';
import { InvestmentTransactionEntity } from './investment-transaction.entity';

@Module({
  imports: [
    AccountActivityModule,
    TypeOrmModule.forFeature([
      AccountEntity,
      InvestmentHoldingSnapshotEntity,
      InvestmentSecurityEntity,
      InvestmentTransactionEntity,
    ]),
  ],
  controllers: [InvestmentController],
  providers: [InvestmentService],
  exports: [InvestmentService],
})
export class InvestmentModule {}
