import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountController } from './account.controller';
import { AccountEntity } from './account.entity';
import { AccountsSurfaceService } from './accounts-surface.service';
import { AccountService } from './account.service';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { ManualBalanceUpdateService } from './manual-balance-update.service';
import { TransactionEntity } from '../transaction/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      BalanceSnapshotEntity,
      TransactionEntity,
    ]),
  ],
  controllers: [AccountController],
  providers: [
    AccountService,
    AccountsSurfaceService,
    ManualBalanceUpdateService,
  ],
  exports: [AccountService, AccountsSurfaceService],
})
export class AccountModule {}
