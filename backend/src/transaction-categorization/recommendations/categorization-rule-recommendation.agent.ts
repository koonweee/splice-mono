import { Injectable } from '@nestjs/common';
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  CategorizationRuleConditionSchema,
  CreateCategorizationRuleDtoSchema,
} from '../../types/CategorizationRule';
import { categorizationRuleRecommendationPrompt } from './categorization-rule-recommendation.prompt';
import {
  CategorizationRuleRecommendationTools,
  type RecommendationToolHandlers,
} from './categorization-rule-recommendation.tools';

export const CategorizationRuleSuggestionCandidateSchema =
  CreateCategorizationRuleDtoSchema.extend({
    rationale: z.string().trim().min(1).max(1000),
    conditions: z.array(CategorizationRuleConditionSchema).min(1).max(4),
  });
export type CategorizationRuleSuggestionCandidate = z.infer<
  typeof CategorizationRuleSuggestionCandidateSchema
>;

const CategorizationRuleSuggestionAgentOutputSchema = z.object({
  suggestions: z.array(CategorizationRuleSuggestionCandidateSchema).max(8),
});

@Injectable()
export class CategorizationRuleRecommendationAgent {
  constructor(
    private readonly recommendationTools: CategorizationRuleRecommendationTools,
  ) {}

  async generateCandidates(options: {
    userId: string;
    model: string;
    maxSteps: number;
    handlers: RecommendationToolHandlers;
  }): Promise<CategorizationRuleSuggestionCandidate[]> {
    const agent = new Agent({
      id: 'categorization-rule-recommendation-agent',
      name: 'categorization-rule-recommendation-agent',
      description:
        'Recommends deterministic transaction categorization rules from manual labels.',
      instructions: categorizationRuleRecommendationPrompt,
      model: openai(options.model),
      tools: this.recommendationTools.createTools(options.handlers),
    });

    const result = await agent.generate(
      [
        {
          role: 'user',
          content: [
            'Generate categorization rule suggestions for this user.',
            `User ID: ${options.userId}`,
            'Use the tools to inspect existing rules, inspect manual examples, preview drafts, and return only useful suggestions.',
          ].join('\n'),
        },
      ],
      {
        maxSteps: options.maxSteps,
        structuredOutput: {
          schema: CategorizationRuleSuggestionAgentOutputSchema,
        },
      },
    );

    const output = CategorizationRuleSuggestionAgentOutputSchema.parse(
      result.object,
    );

    return output.suggestions;
  }
}
