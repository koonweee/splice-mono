import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountController } from './account.controller';
import { AccountEntity } from './account.entity';
import { AccountService } from './account.service';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity, BalanceSnapshotEntity])],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
