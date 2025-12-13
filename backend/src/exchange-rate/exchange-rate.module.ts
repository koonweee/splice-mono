import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { BankLinkModule } from '../bank-link/bank-link.module';
import { UserEntity } from '../user/user.entity';
import { ExchangeRateBackfillHelper } from './exchange-rate-backfill.helper';
import { ExchangeRateEntity } from './exchange-rate.entity';
import { ExchangeRateListener } from './exchange-rate.listener';
import { ExchangeRateScheduledService } from './exchange-rate.scheduled';
import { ExchangeRateService } from './exchange-rate.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExchangeRateEntity,
      AccountEntity,
      UserEntity,
      BalanceSnapshotEntity,
    ]),
    forwardRef(() => BankLinkModule), // For TatumService (crypto exchange rates)
  ],
  providers: [
    ExchangeRateBackfillHelper,
    ExchangeRateService,
    ExchangeRateScheduledService,
    ExchangeRateListener,
  ],
  exports: [ExchangeRateService, ExchangeRateBackfillHelper],
})
export class ExchangeRateModule {}
