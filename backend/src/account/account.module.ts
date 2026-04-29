import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountController } from './account.controller';
import { AccountEntity } from './account.entity';
import { AccountsSurfaceService } from './accounts-surface.service';
import { AccountService } from './account.service';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountEntity, BalanceSnapshotEntity]),
    UserModule,
  ],
  controllers: [AccountController],
  providers: [AccountService, AccountsSurfaceService],
  exports: [AccountService, AccountsSurfaceService],
})
export class AccountModule {}
