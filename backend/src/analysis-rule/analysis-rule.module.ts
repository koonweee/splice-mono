import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from '../category/category.entity';
import { AnalysisRuleController } from './analysis-rule.controller';
import { AnalysisRuleEntity } from './analysis-rule.entity';
import { AnalysisRuleService } from './analysis-rule.service';

@Module({
  imports: [TypeOrmModule.forFeature([AnalysisRuleEntity, CategoryEntity])],
  controllers: [AnalysisRuleController],
  providers: [AnalysisRuleService],
  exports: [AnalysisRuleService],
})
export class AnalysisRuleModule {}
