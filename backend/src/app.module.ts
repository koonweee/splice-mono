import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { BalanceSnapshotModule } from './balance-snapshot/balance-snapshot.module';
import { BankLinkModule } from './bank-link/bank-link.module';
import { CategoryModule } from './category/category.module';
import { dataSourceOptions } from './data-source';
import { ExchangeRateModule } from './exchange-rate/exchange-rate.module';
import { TransactionModule } from './transaction/transaction.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    AuthModule,
    AccountModule,
    BalanceSnapshotModule,
    BankLinkModule,
    CategoryModule,
    ExchangeRateModule,
    TransactionModule,
    UserModule,
    TypeOrmModule.forRoot({
      ...dataSourceOptions,
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
