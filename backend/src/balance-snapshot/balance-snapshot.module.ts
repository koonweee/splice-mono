import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { BalanceSnapshotController } from './balance-snapshot.controller';
import { BalanceSnapshotEntity } from './balance-snapshot.entity';
import { BalanceSnapshotListener } from './balance-snapshot.listener';
import { BalanceSnapshotService } from './balance-snapshot.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BalanceSnapshotEntity]),
    UserModule, // For UserService (to get user's timezone)
  ],
  controllers: [BalanceSnapshotController],
  providers: [BalanceSnapshotService, BalanceSnapshotListener],
  exports: [BalanceSnapshotService],
})
export class BalanceSnapshotModule {}
