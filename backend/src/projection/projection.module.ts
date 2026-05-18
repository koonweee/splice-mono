import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module';
import { BalanceQueryModule } from '../balance-query/balance-query.module';
import { TransactionAnalysisModule } from '../transaction-analysis/transaction-analysis.module';
import { UserModule } from '../user/user.module';
import { ProjectionContextService } from './projection-context.service';
import { ProjectionController } from './projection.controller';
import { ProjectionEngineService } from './projection-engine.service';
import { ProjectionLlmService } from './projection-llm.service';
import { ProjectionService } from './projection.service';

@Module({
  imports: [
    AccountModule,
    BalanceQueryModule,
    TransactionAnalysisModule,
    UserModule,
  ],
  controllers: [ProjectionController],
  providers: [
    ProjectionContextService,
    ProjectionEngineService,
    ProjectionLlmService,
    ProjectionService,
  ],
  exports: [ProjectionService],
})
export class ProjectionModule {}
