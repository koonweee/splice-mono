import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { UserModule } from '../user/user.module';
import { BalanceSnapshotController } from './balance-snapshot.controller';
import { BalanceSnapshotEntity } from './balance-snapshot.entity';
import { BalanceSnapshotListener } from './balance-snapshot.listener';
import { BalanceSnapshotScheduledService } from './balance-snapshot.scheduled';
import { BalanceSnapshotService } from './balance-snapshot.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BalanceSnapshotEntity, AccountEntity]),
    UserModule, // For UserService (to get user's preferred currency)
    ExchangeRateModule, // For CurrencyConversionService
  ],
  controllers: [BalanceSnapshotController],
  providers: [
    BalanceSnapshotService,
    BalanceSnapshotListener,
    BalanceSnapshotScheduledService, // Scheduled tasks for forward-fill operations
  ],
  exports: [BalanceSnapshotService],
})
export class BalanceSnapshotModule {}
