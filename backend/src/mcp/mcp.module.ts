import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountModule } from '../account/account.module';
import { AnalysisRuleModule } from '../analysis-rule/analysis-rule.module';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { BalanceQueryModule } from '../balance-query/balance-query.module';
import { CategoryEntity } from '../category/category.entity';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';
import { InvestmentHoldingSnapshotEntity } from '../investment/investment-holding-snapshot.entity';
import { InvestmentModule } from '../investment/investment.module';
import { InvestmentTransactionEntity } from '../investment/investment-transaction.entity';
import { RecurringManualTransactionModule } from '../recurring-manual-transaction/recurring-manual-transaction.module';
import { TransactionAnalysisModule } from '../transaction-analysis/transaction-analysis.module';
import { TransactionCategorizationModule } from '../transaction-categorization/transaction-categorization.module';
import { TransactionModule } from '../transaction/transaction.module';
import { TransactionEntity } from '../transaction/transaction.entity';
import { UserModule } from '../user/user.module';
import { McpCategorizationService } from './mcp-categorization.service';
import { McpReadService } from './mcp-read.service';
import { McpPortfolioVisualizationService } from './mcp-portfolio-visualization.service';
import { SpliceMcpRuntimeService } from './mcp.runtime';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionEntity,
      BalanceSnapshotEntity,
      CategoryEntity,
      InvestmentHoldingSnapshotEntity,
      InvestmentTransactionEntity,
    ]),
    AccountModule,
    AnalysisRuleModule,
    BalanceQueryModule,
    CurrencyExchangeModule,
    InvestmentModule,
    RecurringManualTransactionModule,
    TransactionAnalysisModule,
    TransactionCategorizationModule,
    TransactionModule,
    UserModule,
  ],
  providers: [
    SpliceMcpRuntimeService,
    McpReadService,
    McpPortfolioVisualizationService,
    McpCategorizationService,
  ],
  exports: [SpliceMcpRuntimeService],
})
export class McpModule {}
