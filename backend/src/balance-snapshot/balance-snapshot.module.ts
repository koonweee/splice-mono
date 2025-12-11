import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { UserModule } from '../user/user.module';
import { BalanceSnapshotController } from './balance-snapshot.controller';
import { BalanceSnapshotEntity } from './balance-snapshot.entity';
import { BalanceSnapshotListener } from './balance-snapshot.listener';
import { BalanceSnapshotService } from './balance-snapshot.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BalanceSnapshotEntity, AccountEntity]),
    UserModule, // For UserService (to get user's preferred currency)
  ],
  controllers: [BalanceSnapshotController],
  providers: [BalanceSnapshotService, BalanceSnapshotListener],
  exports: [BalanceSnapshotService],
})
export class BalanceSnapshotModule {}
