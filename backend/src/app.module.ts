import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PersonalAccessTokenService } from './auth/personal-access-token.service';
import { BalanceQueryModule } from './balance-query/balance-query.module';
import { BalanceSnapshotModule } from './balance-snapshot/balance-snapshot.module';
import { BankLinkModule } from './bank-link/bank-link.module';
import { CategoryModule } from './category/category.module';
import { CurrencyExchangeModule } from './currency-exchange/currency-exchange.module';
import { dataSourceOptions } from './data-source';
import { HealthModule } from './health/health.module';
import { createSeqStream } from './logging/create-seq-stream';
import { McpModule } from './mcp/mcp.module';
import { TransactionAnalysisModule } from './transaction-analysis/transaction-analysis.module';
import { TransactionModule } from './transaction/transaction.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      useFactory: async () => {
        const pino = await import('pino');

        // Build streams array - always include stdout for Docker/Coolify logs
        const streams: DestinationStream[] = [process.stdout];

        // Add Seq stream if configured
        if (process.env.SEQ_SERVER_URL) {
          const seqStream = await createSeqStream({
            serverUrl: process.env.SEQ_SERVER_URL,
            apiKey: process.env.SEQ_API_KEY,
          });
          streams.push(seqStream);
        }

        return {
          pinoHttp: {
            autoLogging: true,
            redact: {
              paths: [
                // Auth headers
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',

                // Request body credentials
                'req.body.password',
                'req.body.token',
                'req.body.personalAccessToken',
                'req.body.refreshToken',
                'req.body.accessToken',

                // Webhook verification headers
                'req.headers["plaid-verification"]',

                // Defense-in-depth for service-level logs
                '*.password',
                '*.tokenHash',
                '*.rawToken',
                '*.accessToken',
                '*.refreshToken',
                '*.userToken',
                '*.clientId',
                '*.public_tokens',
                '*.public_tokens[*]',
              ],
              censor: '[REDACTED]',
            },
            stream: pino.multistream(streams),
            level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
          },
        };
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
    CurrencyExchangeModule,
    HealthModule,
    McpModule,
    TransactionAnalysisModule,
    TransactionModule,
    UserModule,
    TypeOrmModule.forRoot({
      ...dataSourceOptions,
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      inject: [Reflector, PersonalAccessTokenService],
      useFactory: (
        reflector: Reflector,
        personalAccessTokenService: PersonalAccessTokenService,
      ) => new JwtAuthGuard(reflector, personalAccessTokenService),
    },
  ],
})
export class AppModule {}
