import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module';
import { BalanceSnapshotModule } from '../balance-snapshot/balance-snapshot.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AccountModule, BalanceSnapshotModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
