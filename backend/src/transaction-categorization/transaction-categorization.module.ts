import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from '../category/category.entity';
import { TransactionEntity } from '../transaction/transaction.entity';
import { CategorizationRuleController } from './categorization-rule.controller';
import { CategorizationRuleEntity } from './categorization-rule.entity';
import { TransactionCategorizationService } from './categorization-rule.service';
import { RuleBasedCategorizationEngine } from './rule-based-categorization.engine';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CategorizationRuleEntity,
      CategoryEntity,
      TransactionEntity,
    ]),
  ],
  controllers: [CategorizationRuleController],
  providers: [TransactionCategorizationService, RuleBasedCategorizationEngine],
  exports: [TransactionCategorizationService, RuleBasedCategorizationEngine],
})
export class TransactionCategorizationModule {}
