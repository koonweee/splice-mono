import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { UserModule } from '../user/user.module';
import { BalanceQueryController } from './balance-query.controller';
import { BalanceHistorySurfaceService } from './balance-history-surface.service';
import { BalanceQueryService } from './balance-query.service';
import { DashboardQueryService } from './dashboard-query.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountEntity, BalanceSnapshotEntity]),
    CurrencyExchangeModule,
    UserModule,
  ],
  controllers: [BalanceQueryController],
  providers: [
    BalanceQueryService,
    BalanceHistorySurfaceService,
    DashboardQueryService,
  ],
  exports: [BalanceQueryService, BalanceHistorySurfaceService],
})
export class BalanceQueryModule {}
