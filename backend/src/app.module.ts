import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from './account/account.entity';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RefreshTokenEntity } from './auth/refresh-token.entity';
import { BalanceSnapshotEntity } from './balance-snapshot/balance-snapshot.entity';
import { BalanceSnapshotModule } from './balance-snapshot/balance-snapshot.module';
import { BankLinkEntity } from './bank-link/bank-link.entity';
import { BankLinkModule } from './bank-link/bank-link.module';
import { CategoryEntity } from './category/category.entity';
import { CategoryModule } from './category/category.module';
import { TransactionEntity } from './transaction/transaction.entity';
import { TransactionModule } from './transaction/transaction.module';
import { UserEntity } from './user/user.entity';
import { UserModule } from './user/user.module';
import { WebhookEventEntity } from './webhook-event/webhook-event.entity';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    AuthModule,
    AccountModule,
    BalanceSnapshotModule,
    BankLinkModule,
    CategoryModule,
    TransactionModule,
    UserModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT ?? '5432'),
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      // TODO: Remove this in production
      synchronize: true,
      entities: [
        AccountEntity,
        BalanceSnapshotEntity,
        BankLinkEntity,
        CategoryEntity,
        RefreshTokenEntity,
        TransactionEntity,
        UserEntity,
        WebhookEventEntity,
      ],
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
