import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type {
  CategorizationRuleCondition,
  CategorizationRuleChangePreview,
  CategorizationRuleDraftPreview,
  CategorizationRuleView,
  CreateCategorizationRuleDto,
  EditCategorizationRuleDto,
  PreviewCategorizationRuleApplicationResponse,
  PreviewCategorizationRuleDraftDto,
} from '../types/CategorizationRule';
import { TransactionCategorizationService } from '../transaction-categorization/categorization-rule.service';
import { RuleBasedCategorizationEngine } from '../transaction-categorization/rule-based-categorization.engine';
import { CategorizationRuleRecommendationService } from '../transaction-categorization/recommendations/categorization-rule-recommendation.service';

const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;
const PREVIEW_TOKEN_VERSION = 2 as const;

type PreviewTokenPurpose =
  | 'categorization-rule-draft'
  | 'categorization-rule-application'
  | 'categorization-rule-edit'
  | 'categorization-rule-archive'
  | 'categorization-rule-restore';

type PreviewCounts = {
  matched: number;
  updated: number;
  skippedManual: number;
  manualAgreement?: number;
  manualConflicts?: number;
  existingRuleOverlap?: number;
};

type PreviewTokenPayload = {
  version: typeof PREVIEW_TOKEN_VERSION;
  purpose: PreviewTokenPurpose;
  userId: string;
  exp: number;
  iat: number;
  draftHash?: string;
  ruleId?: string;
  ruleRevision?: number;
  changeHash?: string;
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

export type McpCategorizationRuleChangePreview =
  CategorizationRuleChangePreview & {
    normalizedChanges?: EditCategorizationRuleDto;
    previewToken: string;
  };

export type McpEditCategorizationRuleInput = EditCategorizationRuleDto & {
  ruleId: string;
  previewToken: string;
};

export type McpCategorizationRuleStatusInput = {
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

  async getRule(
    userId: string,
    ruleId: string,
  ): Promise<CategorizationRuleView> {
    return this.requireRule(userId, ruleId);
  }

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

    const now = Date.now();
    return {
      ...preview,
      normalizedDraft,
      previewToken: this.signToken({
        version: PREVIEW_TOKEN_VERSION,
        purpose: 'categorization-rule-draft',
        userId,
        iat: now,
        exp: now + PREVIEW_TOKEN_TTL_MS,
        draftHash: this.bindingHash(this.draftKey(normalizedDraft)),
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

  async previewRuleEdit(
    userId: string,
    input: { ruleId: string } & EditCategorizationRuleDto,
  ): Promise<McpCategorizationRuleChangePreview> {
    const normalizedChanges = this.normalizeEdit(input);
    const preview = await this.transactionCategorizationService.previewRuleEdit(
      input.ruleId,
      userId,
      normalizedChanges,
    );
    if (!preview) {
      throw new NotFoundException(
        `Categorization rule ${input.ruleId} not found`,
      );
    }

    return {
      ...preview,
      normalizedChanges,
      previewToken: this.signRuleChangeToken(
        'categorization-rule-edit',
        userId,
        preview.currentRule,
        this.editKey(normalizedChanges),
      ),
    };
  }

  async editRule(
    userId: string,
    input: McpEditCategorizationRuleInput,
  ): Promise<McpCreateCategorizationRuleOutput> {
    const normalizedChanges = this.normalizeEdit(input);
    const payload = this.verifyRuleChangeToken(
      input.previewToken,
      'categorization-rule-edit',
      userId,
      input.ruleId,
      this.editKey(normalizedChanges),
    );
    const rule = await this.transactionCategorizationService.update(
      input.ruleId,
      userId,
      normalizedChanges,
      { expectedRevision: payload.ruleRevision },
    );
    if (!rule) {
      throw new NotFoundException(
        `Categorization rule ${input.ruleId} not found`,
      );
    }

    return { rule };
  }

  async previewRuleArchive(
    userId: string,
    ruleId: string,
  ): Promise<McpCategorizationRuleChangePreview> {
    return this.previewRuleStatusChange(
      userId,
      ruleId,
      'categorization-rule-archive',
    );
  }

  async archiveRule(
    userId: string,
    input: McpCategorizationRuleStatusInput,
  ): Promise<McpCreateCategorizationRuleOutput> {
    return this.changeRuleStatus(
      userId,
      input,
      'categorization-rule-archive',
      true,
    );
  }

  async previewRuleRestore(
    userId: string,
    ruleId: string,
  ): Promise<McpCategorizationRuleChangePreview> {
    return this.previewRuleStatusChange(
      userId,
      ruleId,
      'categorization-rule-restore',
    );
  }

  async restoreRule(
    userId: string,
    input: McpCategorizationRuleStatusInput,
  ): Promise<McpCreateCategorizationRuleOutput> {
    return this.changeRuleStatus(
      userId,
      input,
      'categorization-rule-restore',
      false,
    );
  }

  async previewRuleApplication(
    userId: string,
    ruleId: string,
  ): Promise<McpCategorizationRuleApplicationPreview> {
    const rule = await this.requireRule(userId, ruleId);
    const preview =
      await this.transactionCategorizationService.previewRuleApplication(
        ruleId,
        userId,
      );
    if (!preview) {
      throw new NotFoundException(`Categorization rule ${ruleId} not found`);
    }

    const now = Date.now();
    return {
      ...preview,
      previewToken: this.signToken({
        version: PREVIEW_TOKEN_VERSION,
        purpose: 'categorization-rule-application',
        userId,
        iat: now,
        exp: now + PREVIEW_TOKEN_TTL_MS,
        ruleId,
        ruleRevision: rule.revision,
      }),
    };
  }

  async applyRule(
    userId: string,
    input: McpApplyCategorizationRuleInput,
  ): Promise<PreviewCounts> {
    const payload = this.verifyRuleApplicationPreviewToken(
      input.previewToken,
      userId,
      input.ruleId,
    );

    const result =
      await this.transactionCategorizationService.applyRuleToExisting(
        input.ruleId,
        userId,
        { expectedRevision: payload.ruleRevision },
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

  private normalizeEdit(
    input: EditCategorizationRuleDto,
  ): EditCategorizationRuleDto {
    return {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.targetCategoryId !== undefined
        ? { targetCategoryId: input.targetCategoryId }
        : {}),
      ...(input.conditions !== undefined
        ? { conditions: this.engine.normalizeConditions(input.conditions) }
        : {}),
    };
  }

  private editKey(changes: EditCategorizationRuleDto): string {
    return JSON.stringify({
      name: changes.name ?? null,
      priority: changes.priority ?? null,
      targetCategoryId: changes.targetCategoryId ?? null,
      conditions:
        changes.conditions === undefined
          ? null
          : this.engine.canonicalConditionsKey(changes.conditions),
    });
  }

  private draftKey(draft: McpNormalizedCategorizationRuleDraft): string {
    return JSON.stringify({
      targetCategoryId: draft.targetCategoryId,
      priority: draft.priority ?? null,
      conditions: this.engine.canonicalConditionsKey(draft.conditions),
    });
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
    if (payload.draftHash !== this.bindingHash(this.draftKey(draft))) {
      throw new BadRequestException(
        'Preview token does not match the categorization rule draft',
      );
    }
  }

  private verifyRuleApplicationPreviewToken(
    token: string,
    userId: string,
    ruleId: string,
  ): PreviewTokenPayload {
    const payload = this.verifyToken(
      token,
      'categorization-rule-application',
      userId,
    );
    if (payload.ruleId !== ruleId || !Number.isInteger(payload.ruleRevision)) {
      throw new BadRequestException(
        'Preview token does not match the categorization rule',
      );
    }

    return payload;
  }

  private async previewRuleStatusChange(
    userId: string,
    ruleId: string,
    purpose: 'categorization-rule-archive' | 'categorization-rule-restore',
  ): Promise<McpCategorizationRuleChangePreview> {
    const preview =
      purpose === 'categorization-rule-archive'
        ? await this.transactionCategorizationService.previewRuleArchive(
            ruleId,
            userId,
          )
        : await this.transactionCategorizationService.previewRuleRestore(
            ruleId,
            userId,
          );
    if (!preview) {
      throw new NotFoundException(`Categorization rule ${ruleId} not found`);
    }

    return {
      ...preview,
      previewToken: this.signRuleChangeToken(
        purpose,
        userId,
        preview.currentRule,
      ),
    };
  }

  private async changeRuleStatus(
    userId: string,
    input: McpCategorizationRuleStatusInput,
    purpose: 'categorization-rule-archive' | 'categorization-rule-restore',
    archived: boolean,
  ): Promise<McpCreateCategorizationRuleOutput> {
    const payload = this.verifyRuleChangeToken(
      input.previewToken,
      purpose,
      userId,
      input.ruleId,
    );
    const rule = await this.transactionCategorizationService.update(
      input.ruleId,
      userId,
      { archived },
      { expectedRevision: payload.ruleRevision },
    );
    if (!rule) {
      throw new NotFoundException(
        `Categorization rule ${input.ruleId} not found`,
      );
    }

    return { rule };
  }

  private signRuleChangeToken(
    purpose:
      | 'categorization-rule-edit'
      | 'categorization-rule-archive'
      | 'categorization-rule-restore',
    userId: string,
    rule: CategorizationRuleView,
    changeKey?: string,
  ): string {
    const now = Date.now();
    return this.signToken({
      version: PREVIEW_TOKEN_VERSION,
      purpose,
      userId,
      iat: now,
      exp: now + PREVIEW_TOKEN_TTL_MS,
      ruleId: rule.id,
      ruleRevision: rule.revision,
      ...(changeKey === undefined
        ? {}
        : { changeHash: this.bindingHash(changeKey) }),
    });
  }

  private verifyRuleChangeToken(
    token: string,
    purpose:
      | 'categorization-rule-edit'
      | 'categorization-rule-archive'
      | 'categorization-rule-restore',
    userId: string,
    ruleId: string,
    changeKey?: string,
  ): PreviewTokenPayload {
    const payload = this.verifyToken(token, purpose, userId);
    if (
      payload.ruleId !== ruleId ||
      !Number.isInteger(payload.ruleRevision) ||
      payload.changeHash !==
        (changeKey === undefined ? undefined : this.bindingHash(changeKey))
    ) {
      throw new BadRequestException(
        'Preview token does not match the categorization rule change',
      );
    }

    return payload;
  }

  private async requireRule(
    userId: string,
    ruleId: string,
  ): Promise<CategorizationRuleView> {
    const rule = await this.transactionCategorizationService.findOne(
      ruleId,
      userId,
    );
    if (!rule) {
      throw new NotFoundException(`Categorization rule ${ruleId} not found`);
    }

    return rule;
  }

  private verifyToken(
    token: string,
    purpose: PreviewTokenPurpose,
    userId: string,
  ): PreviewTokenPayload {
    const payload = this.decodeToken(token.replace(/\s/gu, ''));
    if (!payload) {
      throw new BadRequestException('Preview token is invalid');
    }
    if (payload.exp < Date.now()) {
      throw new BadRequestException('Preview token has expired');
    }
    if (payload.purpose !== purpose) {
      throw new BadRequestException(
        'Preview token is not valid for this operation',
      );
    }
    if (payload.userId !== userId) {
      throw new BadRequestException('Preview token is not valid for this user');
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
      const payload: unknown = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      );
      return this.isPreviewTokenPayload(payload) ? payload : null;
    } catch {
      return null;
    }
  }

  private bindingHash(value: string): string {
    return createHash('sha256').update(value).digest('base64url');
  }

  private isPreviewTokenPayload(value: unknown): value is PreviewTokenPayload {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const payload = value as Record<string, unknown>;
    return (
      payload.version === PREVIEW_TOKEN_VERSION &&
      typeof payload.purpose === 'string' &&
      typeof payload.userId === 'string' &&
      typeof payload.iat === 'number' &&
      Number.isFinite(payload.iat) &&
      typeof payload.exp === 'number' &&
      Number.isFinite(payload.exp) &&
      (payload.draftHash === undefined ||
        typeof payload.draftHash === 'string') &&
      (payload.ruleId === undefined || typeof payload.ruleId === 'string') &&
      (payload.ruleRevision === undefined ||
        (typeof payload.ruleRevision === 'number' &&
          Number.isInteger(payload.ruleRevision))) &&
      (payload.changeHash === undefined ||
        typeof payload.changeHash === 'string')
    );
  }

  private getSigningSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }

    return secret;
  }
}
