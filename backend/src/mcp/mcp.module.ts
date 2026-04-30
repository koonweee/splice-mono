import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountModule } from '../account/account.module';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { BalanceQueryModule } from '../balance-query/balance-query.module';
import { CategoryEntity } from '../category/category.entity';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { TransactionModule } from '../transaction/transaction.module';
import { TransactionEntity } from '../transaction/transaction.entity';
import { UserModule } from '../user/user.module';
import { McpController } from './mcp.controller';
import { McpReadService } from './mcp-read.service';
import { SpliceMcpService } from './mcp.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionEntity,
      BalanceSnapshotEntity,
      CategoryEntity,
    ]),
    AccountModule,
    BalanceQueryModule,
    CurrencyExchangeModule,
    TransactionModule,
    UserModule,
  ],
  controllers: [McpController],
  providers: [SpliceMcpService, McpReadService],
  exports: [SpliceMcpService],
})
export class McpModule {}
