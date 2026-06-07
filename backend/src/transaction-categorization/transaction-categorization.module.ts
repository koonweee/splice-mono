import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { CategoryEntity } from '../category/category.entity';
import { TransactionEntity } from '../transaction/transaction.entity';
import { CategorizationRuleController } from './categorization-rule.controller';
import { CategorizationRuleEntity } from './categorization-rule.entity';
import { TransactionCategorizationService } from './categorization-rule.service';
import { CategorizationRuleRecommendationController } from './recommendations/categorization-rule-recommendation.controller';
import { CategorizationRuleSuggestionGenerationEntity } from './recommendations/categorization-rule-recommendation-generation.entity';
import { CategorizationRuleSuggestionEntity } from './recommendations/categorization-rule-recommendation.entity';
import { CategorizationRuleRecommendationAgent } from './recommendations/categorization-rule-recommendation.agent';
import { CategorizationRuleRecommendationProcessor } from './recommendations/categorization-rule-recommendation.processor';
import { CategorizationRuleRecommendationService } from './recommendations/categorization-rule-recommendation.service';
import { CategorizationRuleRecommendationTools } from './recommendations/categorization-rule-recommendation.tools';
import { RuleBasedCategorizationEngine } from './rule-based-categorization.engine';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CategorizationRuleEntity,
      CategorizationRuleSuggestionEntity,
      CategorizationRuleSuggestionGenerationEntity,
      AccountEntity,
      CategoryEntity,
      TransactionEntity,
    ]),
  ],
  controllers: [
    CategorizationRuleController,
    CategorizationRuleRecommendationController,
  ],
  providers: [
    TransactionCategorizationService,
    RuleBasedCategorizationEngine,
    CategorizationRuleRecommendationService,
    CategorizationRuleRecommendationProcessor,
    CategorizationRuleRecommendationAgent,
    CategorizationRuleRecommendationTools,
  ],
  exports: [
    TransactionCategorizationService,
    RuleBasedCategorizationEngine,
    CategorizationRuleRecommendationService,
  ],
})
export class TransactionCategorizationModule {}
