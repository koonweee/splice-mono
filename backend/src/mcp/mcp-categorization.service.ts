import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type {
  CategorizationRuleCondition,
  CategorizationRuleDraftPreview,
  CategorizationRuleView,
  CreateCategorizationRuleDto,
  PreviewCategorizationRuleApplicationResponse,
  PreviewCategorizationRuleDraftDto,
} from '../types/CategorizationRule';
import { TransactionCategorizationService } from '../transaction-categorization/categorization-rule.service';
import { RuleBasedCategorizationEngine } from '../transaction-categorization/rule-based-categorization.engine';
import { CategorizationRuleRecommendationService } from '../transaction-categorization/recommendations/categorization-rule-recommendation.service';

const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;

type PreviewTokenPurpose =
  | 'categorization-rule-draft'
  | 'categorization-rule-application';

type PreviewCounts = {
  matched: number;
  updated: number;
  skippedManual: number;
  manualAgreement?: number;
  manualConflicts?: number;
  existingRuleOverlap?: number;
};

type PreviewTokenPayload = {
  purpose: PreviewTokenPurpose;
  userId: string;
  exp: number;
  draftKey?: string;
  ruleId?: string;
  preview: PreviewCounts;
};

export type McpNormalizedCategorizationRuleDraft = {
  targetCategoryId: string;
  priority?: number;
  conditions: CategorizationRuleCondition[];
};

export type McpCategorizationRuleDraftPreview =
  CategorizationRuleDraftPreview & {
    normalizedDraft: McpNormalizedCategorizationRuleDraft;
    previewToken: string;
  };

export type McpCreateCategorizationRuleInput = CreateCategorizationRuleDto & {
  previewToken: string;
};

export type McpCreateCategorizationRuleOutput = {
  rule: CategorizationRuleView;
};

export type McpCategorizationRuleApplicationPreview =
  PreviewCategorizationRuleApplicationResponse & {
    previewToken: string;
  };

export type McpApplyCategorizationRuleInput = {
  ruleId: string;
  previewToken: string;
};

@Injectable()
export class McpCategorizationService {
  constructor(
    private readonly transactionCategorizationService: TransactionCategorizationService,
    private readonly recommendationService: CategorizationRuleRecommendationService,
    private readonly engine: RuleBasedCategorizationEngine,
  ) {}

  async listManualCategorizedTransactionExamples(
    userId: string,
    input: {
      categoryId?: string;
      query?: string;
      limit?: number;
      ignoredCategoryIds?: string[];
    },
  ): Promise<unknown> {
    return this.recommendationService.searchManualExamples(
      userId,
      {
        categoryId: input.categoryId,
        query: input.query,
        limit: input.limit,
      },
      { ignoredCategoryIds: input.ignoredCategoryIds },
    );
  }

  async listRuleCandidatePatterns(
    userId: string,
    input: {
      fields?: Array<
        | 'merchantName'
        | 'website'
        | 'merchantEntityId'
        | 'providerCategoryDetailed'
        | 'providerCategoryPrimary'
      >;
      minAgreement?: number;
      maxConflictRate?: number;
      limit?: number;
      ignoredCategoryIds?: string[];
    },
  ): Promise<unknown> {
    return this.recommendationService.listRuleCandidatePatternsForAgent(
      userId,
      {
        fields: input.fields,
        minAgreement: input.minAgreement,
        maxConflictRate: input.maxConflictRate,
        limit: input.limit,
      },
      { ignoredCategoryIds: input.ignoredCategoryIds },
    );
  }

  async previewDraft(
    userId: string,
    input: PreviewCategorizationRuleDraftDto & {
      ignoredManualCategoryIds?: string[];
    },
  ): Promise<McpCategorizationRuleDraftPreview> {
    const normalizedDraft = this.normalizeDraft(input);
    const preview =
      await this.transactionCategorizationService.previewDraftRuleApplication(
        userId,
        {
          targetCategoryId: normalizedDraft.targetCategoryId,
          priority: normalizedDraft.priority,
          conditions: normalizedDraft.conditions,
        },
        {
          ignoredManualCategoryIds: input.ignoredManualCategoryIds,
        },
      );

    return {
      ...preview,
      normalizedDraft,
      previewToken: this.signToken({
        purpose: 'categorization-rule-draft',
        userId,
        exp: Date.now() + PREVIEW_TOKEN_TTL_MS,
        draftKey: this.draftKey(normalizedDraft),
        preview: this.previewCounts(preview),
      }),
    };
  }

  async createRule(
    userId: string,
    input: McpCreateCategorizationRuleInput,
  ): Promise<McpCreateCategorizationRuleOutput> {
    const normalizedDraft = this.normalizeDraft(input);
    this.verifyDraftPreviewToken(input.previewToken, userId, normalizedDraft);

    const rule = await this.transactionCategorizationService.create(userId, {
      name: input.name,
      priority: normalizedDraft.priority,
      targetCategoryId: normalizedDraft.targetCategoryId,
      conditions: normalizedDraft.conditions,
    });

    return { rule };
  }

  async previewRuleApplication(
    userId: string,
    ruleId: string,
  ): Promise<McpCategorizationRuleApplicationPreview> {
    const preview =
      await this.transactionCategorizationService.previewRuleApplication(
        ruleId,
        userId,
      );
    if (!preview) {
      throw new NotFoundException(`Categorization rule ${ruleId} not found`);
    }

    return {
      ...preview,
      previewToken: this.signToken({
        purpose: 'categorization-rule-application',
        userId,
        exp: Date.now() + PREVIEW_TOKEN_TTL_MS,
        ruleId,
        preview: this.previewCounts(preview),
      }),
    };
  }

  async applyRule(
    userId: string,
    input: McpApplyCategorizationRuleInput,
  ): Promise<PreviewCounts> {
    this.verifyRuleApplicationPreviewToken(
      input.previewToken,
      userId,
      input.ruleId,
    );

    const result =
      await this.transactionCategorizationService.applyRuleToExisting(
        input.ruleId,
        userId,
      );
    if (!result) {
      throw new NotFoundException(
        `Categorization rule ${input.ruleId} not found`,
      );
    }

    return result;
  }

  private normalizeDraft(input: {
    targetCategoryId: string;
    priority?: number;
    conditions: CategorizationRuleCondition[];
  }): McpNormalizedCategorizationRuleDraft {
    return {
      targetCategoryId: input.targetCategoryId,
      priority: input.priority,
      conditions: this.engine.normalizeConditions(input.conditions),
    };
  }

  private draftKey(draft: McpNormalizedCategorizationRuleDraft): string {
    return JSON.stringify({
      targetCategoryId: draft.targetCategoryId,
      priority: draft.priority ?? null,
      conditions: this.engine.canonicalConditionsKey(draft.conditions),
    });
  }

  private previewCounts(preview: PreviewCounts): PreviewCounts {
    return {
      matched: preview.matched,
      updated: preview.updated,
      skippedManual: preview.skippedManual,
      ...(preview.manualAgreement !== undefined
        ? { manualAgreement: preview.manualAgreement }
        : {}),
      ...(preview.manualConflicts !== undefined
        ? { manualConflicts: preview.manualConflicts }
        : {}),
      ...(preview.existingRuleOverlap !== undefined
        ? { existingRuleOverlap: preview.existingRuleOverlap }
        : {}),
    };
  }

  private verifyDraftPreviewToken(
    token: string,
    userId: string,
    draft: McpNormalizedCategorizationRuleDraft,
  ): void {
    const payload = this.verifyToken(
      token,
      'categorization-rule-draft',
      userId,
    );
    if (payload.draftKey !== this.draftKey(draft)) {
      throw new BadRequestException(
        'Preview token does not match the categorization rule draft',
      );
    }
  }

  private verifyRuleApplicationPreviewToken(
    token: string,
    userId: string,
    ruleId: string,
  ): void {
    const payload = this.verifyToken(
      token,
      'categorization-rule-application',
      userId,
    );
    if (payload.ruleId !== ruleId) {
      throw new BadRequestException(
        'Preview token does not match the categorization rule',
      );
    }
  }

  private verifyToken(
    token: string,
    purpose: PreviewTokenPurpose,
    userId: string,
  ): PreviewTokenPayload {
    const payload = this.decodeToken(token);
    if (
      !payload ||
      payload.purpose !== purpose ||
      payload.userId !== userId ||
      payload.exp < Date.now()
    ) {
      throw new BadRequestException('Preview token is invalid or expired');
    }

    return payload;
  }

  private signToken(payload: PreviewTokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.getSigningSecret())
      .update(body)
      .digest('base64url');

    return `${body}.${signature}`;
  }

  private decodeToken(token: string): PreviewTokenPayload | null {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra !== undefined) {
      return null;
    }

    const expectedSignature = createHmac('sha256', this.getSigningSecret())
      .update(body)
      .digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return null;
    }

    try {
      return JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as PreviewTokenPayload;
    } catch {
      return null;
    }
  }

  private getSigningSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }

    return secret;
  }
}
