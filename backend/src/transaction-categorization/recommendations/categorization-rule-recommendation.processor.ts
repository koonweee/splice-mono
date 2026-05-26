import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CategorizationRuleRecommendationAgent } from './categorization-rule-recommendation.agent';
import { CategorizationRuleRecommendationService } from './categorization-rule-recommendation.service';

@Injectable()
export class CategorizationRuleRecommendationProcessor {
  private readonly logger = new Logger(
    CategorizationRuleRecommendationProcessor.name,
  );
  private processing = false;

  constructor(
    private readonly recommendationService: CategorizationRuleRecommendationService,
    private readonly recommendationAgent: CategorizationRuleRecommendationAgent,
  ) {}

  @Cron('*/10 * * * * *')
  async processPending(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;
    try {
      for (;;) {
        const generation =
          await this.recommendationService.acquirePendingGeneration();
        if (!generation) {
          break;
        }

        try {
          const generationOptions = {
            ignoredCategoryIds: generation.ignoredCategoryIds,
          };
          const deterministicCandidates =
            await this.recommendationService.listDeterministicCandidatesForGeneration(
              generation.userId,
              generationOptions,
            );
          const agentCandidates =
            await this.recommendationAgent.generateCandidates({
              userId: generation.userId,
              model: generation.model,
              maxSteps: this.recommendationService.getMaxToolSteps(),
              handlers: {
                listExistingCategorizationRules: () =>
                  this.recommendationService.listExistingRulesForAgent(
                    generation.userId,
                    generationOptions,
                  ),
                searchManualCategorizedTransactions: (input) =>
                  this.recommendationService.searchManualExamples(
                    generation.userId,
                    input,
                    generationOptions,
                  ),
                listRuleCandidatePatterns: (input) =>
                  this.recommendationService.listRuleCandidatePatternsForAgent(
                    generation.userId,
                    input,
                    generationOptions,
                  ),
                previewDraftCategorizationRule: (input) =>
                  this.recommendationService.previewDraftForAgent(
                    generation.userId,
                    input,
                    generationOptions,
                  ),
              },
            });
          const candidates = [...deterministicCandidates, ...agentCandidates];
          const persisted = await this.recommendationService.completeGeneration(
            generation,
            candidates,
          );
          this.logger.log(
            {
              userId: generation.userId,
              generationId: generation.id,
              deterministicCandidateCount: deterministicCandidates.length,
              agentCandidateCount: agentCandidates.length,
              candidateCount: candidates.length,
              persistedCount: persisted.length,
            },
            'Generated categorization rule recommendations',
          );
        } catch (error) {
          await this.recommendationService.failGeneration(generation, error);
          this.logger.error(
            {
              userId: generation.userId,
              generationId: generation.id,
              error: error instanceof Error ? error.message : String(error),
            },
            'Categorization rule recommendation generation failed',
          );
        }
      }
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Categorization rule recommendation processor run failed',
      );
    } finally {
      this.processing = false;
    }
  }
}
