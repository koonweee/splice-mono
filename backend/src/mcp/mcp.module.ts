import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module';
import { BalanceQueryModule } from '../balance-query/balance-query.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UserModule } from '../user/user.module';
import { McpController } from './mcp.controller';
import { SpliceMcpService } from './mcp.service';

@Module({
  imports: [AccountModule, BalanceQueryModule, TransactionModule, UserModule],
  controllers: [McpController],
  providers: [SpliceMcpService],
  exports: [SpliceMcpService],
})
export class McpModule {}
