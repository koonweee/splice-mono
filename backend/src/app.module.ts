import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { BalanceQueryModule } from './balance-query/balance-query.module';
import { BalanceSnapshotModule } from './balance-snapshot/balance-snapshot.module';
import { BankLinkModule } from './bank-link/bank-link.module';
import { CategoryModule } from './category/category.module';
import { dataSourceOptions } from './data-source';
import { ExchangeRateModule } from './exchange-rate/exchange-rate.module';
import { TransactionModule } from './transaction/transaction.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: false,
        transport: process.env.SEQ_SERVER_URL
          ? {
              target: 'pino-seq',
              options: {
                serverUrl: process.env.SEQ_SERVER_URL,
                apiKey: process.env.SEQ_API_KEY,
              },
            }
          : {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
              },
            },
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      },
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    AuthModule,
    AccountModule,
    BalanceQueryModule,
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
