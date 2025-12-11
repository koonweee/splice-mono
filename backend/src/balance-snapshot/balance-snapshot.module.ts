import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { BalanceSnapshotEntity } from './balance-snapshot.entity';
import { BalanceSnapshotListener } from './balance-snapshot.listener';
import { BalanceSnapshotService } from './balance-snapshot.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BalanceSnapshotEntity]),
    UserModule, // For UserService (to get user's timezone)
  ],
  providers: [BalanceSnapshotService, BalanceSnapshotListener],
  exports: [BalanceSnapshotService],
})
export class BalanceSnapshotModule {}
