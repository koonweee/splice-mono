import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { UserModule } from '../user/user.module';
import { BalanceQueryController } from './balance-query.controller';
import { BalanceQueryService } from './balance-query.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountEntity, BalanceSnapshotEntity]),
    CurrencyExchangeModule,
    UserModule,
  ],
  controllers: [BalanceQueryController],
  providers: [BalanceQueryService],
  exports: [BalanceQueryService],
})
export class BalanceQueryModule {}
