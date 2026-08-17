import {
  defineServer,
  defineTool,
  McpPublicError,
  validateMcpApps,
  type McpToolRequestContext,
  type McpToolResult,
  type McpToolRisk,
  type McpUiToolMetadata,
} from '@koonweee/mcp-kit';
import {
  acceptedContent,
  inputRequired,
  inputResponse,
  isInputRequiredResult,
  type CallToolResult,
  type InputRequiredResult,
  type MetaObject,
  type ServerContext,
  type StandardSchemaWithJSON,
} from '@modelcontextprotocol/server';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import type { AccountsSurfaceService } from '../account/accounts-surface.service';
import type { BalanceHistorySurfaceService } from '../balance-query/balance-history-surface.service';
import type { TransactionAnalysisService } from '../transaction-analysis/transaction-analysis.service';
import type { TransactionsSurfaceService } from '../transaction/transactions-surface.service';
import { CategorizationRuleConditionSchema } from '../types/CategorizationRule';
import { MoneySign } from '../types/MoneyWithSign';
import type { UserService } from '../user/user.service';
import { normalizeMcpMoney } from './mcp-money';
import type { McpReadService } from './mcp-read.service';
import { APP_RESOURCES, MCP_APP_RESOURCES, appToolResult } from './mcp-apps';
import {
  ApplyCategorizationRuleOutputSchema,
  AccountsSnapshotOutputSchema,
  AppToolOutputSchema,
  BalanceHistoryOutputSchema,
  CashflowAnalysisOutputSchema,
  CashflowAuditOutputSchema,
  CashflowCategoryTransactionsOutputSchema,
  CategoriesOutputSchema,
  CategorizationRuleApplicationPreviewOutputSchema,
  CategorizationRuleDraftPreviewOutputSchema,
  CategorizationRecommendationsOutputSchema,
  CreateCategorizationRuleOutputSchema,
  GetUserContextOutputSchema,
  InvestmentHoldingsOutputSchema,
  ManualCategorizedExamplesOutputSchema,
  PaginatedListOutputSchema,
  ProjectionAssumptionsOutputSchema,
  RecurringSchedulesOutputSchema,
  RuleCandidatePatternsOutputSchema,
  RuleListOutputSchema,
  SearchTransactionsOutputSchema,
} from './mcp-schemas';
import type { McpCategorizationService } from './mcp-categorization.service';
import {
  CurrencySchema,
  DateStringSchema,
  UuidSchema,
  assertDateRange,
  mcpCashflowAnalysis,
  registerSpliceMcpExtensions,
} from './mcp.extensions';

export interface SpliceMcpDependencies {
  readonly userId: string;
  readonly userService: UserService;
  readonly accountsSurfaceService: AccountsSurfaceService;
  readonly balanceHistorySurfaceService: BalanceHistorySurfaceService;
  readonly transactionsSurfaceService: TransactionsSurfaceService;
  readonly mcpReadService: McpReadService;
  readonly mcpCategorizationService: McpCategorizationService;
  readonly transactionAnalysisService: TransactionAnalysisService;
}

export type SpliceMcpServices = Omit<SpliceMcpDependencies, 'userId'>;

export function createSpliceMcpDependencies(
  userId: string,
  services: SpliceMcpServices,
): SpliceMcpDependencies {
  return { userId, ...services };
}

const CategoryIdFilterSchema = z.union([
  UuidSchema,
  z.literal('UNCATEGORIZED'),
]);
const CursorSchema = z
  .string()
  .optional()
  .describe('Opaque cursor returned by the previous pageInfo.nextCursor.');
const IgnoredCategoryIdsSchema = z
  .array(UuidSchema)
  .max(100)
  .optional()
  .describe(
    'Optional manual category IDs to ignore when counting manual conflicts.',
  );
const RuleCandidatePatternFieldSchema = z.enum([
  'merchantName',
  'website',
  'merchantEntityId',
  'providerCategoryDetailed',
  'providerCategoryPrimary',
]);

const PROJECTION_INPUT_KEY = 'projectionAssumptions';
const ProjectionAssumptionsFormSchema = z.object({
  horizonDate: z.string().describe('Projection horizon date in YYYY-MM-DD.'),
  goalName: z.string().optional().describe('Optional scenario label.'),
  recurringIncomeAdjustment: z
    .number()
    .optional()
    .describe('Monthly recurring income change in major units.'),
  recurringExpenseAdjustment: z
    .number()
    .optional()
    .describe('Monthly recurring expense change in major units.'),
  oneTimeEventsText: z
    .string()
    .optional()
    .describe(
      'Optional plain-text event list with date, amount, currency, sign, and label.',
    ),
  expectedAnnualReturnPercent: z
    .number()
    .optional()
    .describe('Optional expected annual return percentage.'),
});
const ProjectionAssumptionsInputSchema = ProjectionAssumptionsFormSchema.extend(
  {
    horizonDate: DateStringSchema.describe(
      'Projection horizon date in YYYY-MM-DD.',
    ),
  },
);

function toolResult(data: unknown): CallToolResult {
  const structuredContent = normalizeMcpMoney(data);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}

function getTodayForTimezone(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fall back to UTC if the stored timezone is invalid.
  }

  return new Date().toISOString().slice(0, 10);
}

type SpliceToolConfig<
  TInputShape extends z.ZodRawShape,
  TOutputSchema extends z.ZodType & StandardSchemaWithJSON,
> = {
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: TInputShape;
  readonly outputSchema: TOutputSchema;
  readonly requiredScopes: readonly string[];
  readonly risk: McpToolRisk;
  readonly _meta?: MetaObject;
  readonly ui?: McpUiToolMetadata;
};

type SpliceToolHandler<TInputShape extends z.ZodRawShape> = (
  input: z.output<z.ZodObject<TInputShape>>,
  dependencies: SpliceMcpDependencies,
  sdkContext: ServerContext,
  requestContext: McpToolRequestContext<SpliceMcpDependencies>,
) =>
  | CallToolResult
  | InputRequiredResult
  | Promise<CallToolResult | InputRequiredResult>;

function publicNestMessage(
  error: BadRequestException | ConflictException | NotFoundException,
  fallback: string,
): string {
  const response: unknown = error.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response !== 'object' || response === null) return fallback;

  const message = (response as Record<string, unknown>).message;
  if (typeof message === 'string' && message.length > 0) return message;
  if (
    Array.isArray(message) &&
    message.length > 0 &&
    message.every((item) => typeof item === 'string')
  ) {
    return message.join('; ');
  }
  return fallback;
}

function publicSpliceToolError(error: unknown): unknown {
  if (error instanceof McpPublicError) return error;
  if (error instanceof BadRequestException) {
    return new McpPublicError(
      'invalid_request',
      publicNestMessage(error, 'The request is invalid'),
      { cause: error },
    );
  }
  if (error instanceof NotFoundException) {
    return new McpPublicError(
      'not_found',
      publicNestMessage(error, 'The requested item was not found'),
      { cause: error },
    );
  }
  if (error instanceof ConflictException) {
    return new McpPublicError(
      'conflict',
      publicNestMessage(error, 'The request conflicts with existing data'),
      { cause: error },
    );
  }
  return error;
}

const defineSpliceTool = defineTool<SpliceMcpDependencies>();

function createSpliceTool<
  TInputShape extends z.ZodRawShape,
  TOutputSchema extends z.ZodType & StandardSchemaWithJSON,
>(
  name: string,
  config: SpliceToolConfig<TInputShape, TOutputSchema>,
  handler: SpliceToolHandler<TInputShape>,
) {
  return defineSpliceTool({
    name,
    ...config,
    inputSchema: z.object(config.inputSchema),
    handler: async (input, context, sdkContext) => {
      let result: CallToolResult | InputRequiredResult;
      try {
        result = await handler(
          input,
          context.dependencies,
          sdkContext,
          context,
        );
      } catch (error) {
        throw publicSpliceToolError(error);
      }

      if (isInputRequiredResult(result)) {
        return result;
      }

      if (result.isError === true) {
        return { ...result, isError: true as const };
      }

      const structuredContent: StandardSchemaWithJSON.InferOutput<TOutputSchema> =
        await config.outputSchema.parseAsync(result.structuredContent);

      return {
        ...result,
        structuredContent,
        isError: false as const,
      } as McpToolResult<TOutputSchema>;
    },
  });
}

export const SPLICE_MCP_TOOL_NAMES = [
  'get_user_context',
  'get_accounts_snapshot',
  'get_balance_history',
  'search_transactions',
  'list_transactions',
  'list_balance_snapshots',
  'list_categories',
  'list_investment_holdings',
  'list_investment_activity',
  'list_recurring_manual_transaction_schedules',
  'list_analysis_rules',
  'list_categorization_rules',
  'list_categorization_rule_recommendations',
  'list_manual_categorized_transaction_examples',
  'list_rule_candidate_patterns',
  'preview_categorization_rule_draft',
  'create_categorization_rule',
  'preview_categorization_rule_application',
  'apply_categorization_rule',
  'get_cashflow_analysis',
  'list_cashflow_category_transactions',
  'get_cashflow_analysis_audit',
  'show_cashflow_explorer',
  'show_projection_scenario_modeler',
  'show_portfolio_viewer',
  'show_category_rule_workbench',
  'collect_projection_assumptions',
] as const;

export const spliceMcpDefinition = defineServer<SpliceMcpDependencies>()({
  name: 'splice',
  version: '1.0.0',
  apps: {
    resources: MCP_APP_RESOURCES,
    compatibility: { openaiLegacyAliases: true },
  },
  tools: [
    createSpliceTool(
      'get_user_context',
      {
        title: 'Get User Context',
        description:
          'Get the authenticated Splice user timezone, preferred currency, and current date.',
        inputSchema: {},
        outputSchema: GetUserContextOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (_input, dependencies) => {
        const user = await dependencies.userService.findOne(
          dependencies.userId,
        );
        if (!user) {
          throw new NotFoundException('User not found');
        }

        return toolResult({
          userId: user.id,
          email: user.email,
          currency: user.settings.currency,
          timezone: user.settings.timezone,
          today: getTodayForTimezone(user.settings.timezone),
        });
      },
    ),

    createSpliceTool(
      'get_accounts_snapshot',
      {
        title: 'Get Accounts Snapshot',
        description:
          'Get current Splice accounts, institutions, account groupings, and balances for the authenticated user.',
        inputSchema: {},
        outputSchema: AccountsSnapshotOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (_input, dependencies) =>
        toolResult(
          await dependencies.accountsSurfaceService.getAccountsSnapshot(
            dependencies.userId,
          ),
        ),
    ),

    createSpliceTool(
      'get_balance_history',
      {
        title: 'Get Balance History',
        description:
          'Get net worth, balance trend, chart points, and account balances over a date range.',
        inputSchema: {
          startDate: DateStringSchema,
          endDate: DateStringSchema,
          accountIds: z.array(z.string().uuid()).optional(),
        },
        outputSchema: BalanceHistoryOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.balanceHistorySurfaceService.getBalanceHistorySummary(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'search_transactions',
      {
        title: 'Search Transactions',
        description:
          'Legacy transaction search by activity date, account, merchant, category, sign, amount, and pending state. activityDate uses reportingDateOverride when set. Returns at most 20 rows; use list_transactions for spending totals or patterns.',
        inputSchema: {
          startDate: DateStringSchema.optional(),
          endDate: DateStringSchema.optional(),
          accountIds: z.array(z.string().uuid()).optional(),
          categoryPrimary: z.string().optional(),
          merchantQuery: z.string().optional(),
          minAmount: z.number().optional(),
          maxAmount: z.number().optional(),
          sign: z.enum(['positive', 'negative']).optional(),
          includePending: z.boolean().optional(),
          limit: z.number().int().positive().max(20).optional(),
        },
        outputSchema: SearchTransactionsOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.transactionsSurfaceService.searchTransactions(
            dependencies.userId,
            {
              ...input,
              limit: Math.min(input.limit ?? 20, 20),
            },
          ),
        ),
    ),

    createSpliceTool(
      'list_transactions',
      {
        title: 'List Transactions',
        description:
          'List raw transactions for analysis with cursor pagination. Date ranges use activityDate, which respects reportingDateOverride when set. For spending totals or patterns, keep paging until pageInfo.hasMore is false. All money amounts are major units. Always use convertedAmount for cross-currency comparisons.',
        inputSchema: {
          startDate: DateStringSchema.optional().describe(
            'Inclusive activity start date in YYYY-MM-DD. activityDate uses reportingDateOverride when set. Resolve relative dates using get_user_context.today.',
          ),
          endDate: DateStringSchema.optional().describe(
            'Inclusive activity end date in YYYY-MM-DD. activityDate uses reportingDateOverride when set. Resolve relative dates using get_user_context.today.',
          ),
          accountIds: z
            .array(z.string().uuid())
            .optional()
            .describe('Optional account IDs to restrict the result set.'),
          categoryPrimary: z
            .string()
            .optional()
            .describe(
              'Primary category code, e.g. FOOD_AND_DRINK. Use list_categories to discover valid values. Use UNCATEGORIZED for uncategorized rows.',
            ),
          categoryId: CategoryIdFilterSchema.optional().describe(
            'Exact user category ID, or UNCATEGORIZED. Cannot be combined with categoryPrimary or categoryDetailed.',
          ),
          categoryDetailed: z
            .string()
            .optional()
            .describe(
              'Detailed user category code/label. Cannot be combined with categoryId.',
            ),
          merchantQuery: z
            .string()
            .optional()
            .describe('Case-insensitive fuzzy merchant-name search.'),
          amountSign: z
            .nativeEnum(MoneySign)
            .optional()
            .describe('Filter by transaction amount sign.'),
          includePending: z
            .boolean()
            .optional()
            .describe(
              'Defaults to false. State whether pending rows were included.',
            ),
          cursor: CursorSchema,
          pageSize: z
            .number()
            .int()
            .positive()
            .max(100)
            .optional()
            .describe('Defaults to 50, maximum 100.'),
          reportingCurrency: CurrencySchema.describe(
            'Required currency for convertedAmount. Use get_user_context.currency unless the user asks for another currency.',
          ),
          amountFilter: z
            .object({
              min: z
                .number()
                .nonnegative()
                .optional()
                .describe('Minimum absolute amount in major units.'),
              max: z
                .number()
                .nonnegative()
                .optional()
                .describe('Maximum absolute amount in major units.'),
              currency: CurrencySchema.describe(
                'Must match reportingCurrency. Candidate transactions are converted before this filter is applied.',
              ),
            })
            .optional()
            .describe(
              'Converted amount filter. Requires currency and is applied to convertedAmount after currency conversion.',
            ),
        },
        outputSchema: PaginatedListOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpReadService.listTransactions(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'list_balance_snapshots',
      {
        title: 'List Balance Snapshots',
        description:
          'List raw per-account balance snapshots for historical baselines and projection setup. Keep paging until pageInfo.hasMore is false when the full range matters.',
        inputSchema: {
          startDate: DateStringSchema.optional().describe(
            'Inclusive start date in YYYY-MM-DD.',
          ),
          endDate: DateStringSchema.optional().describe(
            'Inclusive end date in YYYY-MM-DD.',
          ),
          accountIds: z
            .array(z.string().uuid())
            .optional()
            .describe('Optional account IDs to restrict the result set.'),
          cursor: CursorSchema,
          pageSize: z
            .number()
            .int()
            .positive()
            .max(250)
            .optional()
            .describe('Defaults to 100, maximum 250.'),
        },
        outputSchema: PaginatedListOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpReadService.listBalanceSnapshots(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'list_categories',
      {
        title: 'List Categories',
        description:
          'List the current user category codes and friendly labels. Provider category hints on transactions are guidance only and are not valid category filters.',
        inputSchema: {
          startDate: DateStringSchema.optional().describe(
            'Optional inclusive activity start date for transaction counts.',
          ),
          endDate: DateStringSchema.optional().describe(
            'Optional inclusive activity end date for transaction counts.',
          ),
          includeArchived: z
            .boolean()
            .optional()
            .describe('When true, include archived user categories.'),
        },
        outputSchema: CategoriesOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpReadService.listCategories(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'list_investment_holdings',
      {
        title: 'List Investment Holdings',
        description:
          'List latest or date-specific investment position snapshots. Holdings are portfolio positions and are separate from account balance snapshots.',
        inputSchema: {
          accountIds: z
            .array(UuidSchema)
            .optional()
            .describe(
              'Optional account IDs. Defaults to all owned investment accounts.',
            ),
          snapshotDate: DateStringSchema.optional().describe(
            'Optional holdings snapshot date in YYYY-MM-DD.',
          ),
          latestOnly: z
            .boolean()
            .optional()
            .describe(
              'Set to true or omit for latest holdings. Cannot be combined with snapshotDate; use snapshotDate for date-specific holdings.',
            ),
        },
        outputSchema: InvestmentHoldingsOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpReadService.listInvestmentHoldings(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'list_investment_activity',
      {
        title: 'List Investment Activity',
        description:
          'List investment transactions with cursor pagination. Investment activity is not included in banking/manual cash-flow analysis.',
        inputSchema: {
          accountIds: z
            .array(UuidSchema)
            .optional()
            .describe('Optional investment account IDs to restrict results.'),
          startDate: DateStringSchema.optional().describe(
            'Inclusive investment activity start date in YYYY-MM-DD.',
          ),
          endDate: DateStringSchema.optional().describe(
            'Inclusive investment activity end date in YYYY-MM-DD.',
          ),
          type: z.string().optional().describe('Optional investment type.'),
          subtype: z
            .string()
            .optional()
            .describe('Optional investment subtype.'),
          cursor: CursorSchema,
          pageSize: z
            .number()
            .int()
            .positive()
            .max(100)
            .optional()
            .describe('Defaults to 50, maximum 100.'),
        },
        outputSchema: PaginatedListOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpReadService.listInvestmentActivity(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'list_recurring_manual_transaction_schedules',
      {
        title: 'List Recurring Manual Transaction Schedules',
        description:
          'List recurring manual transaction schedules for projection assumptions. Schedules are not generated future transactions.',
        inputSchema: {
          includePaused: z
            .boolean()
            .optional()
            .describe(
              'Defaults to true. When false, paused schedules are omitted.',
            ),
        },
        outputSchema: RecurringSchedulesOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpReadService.listRecurringManualTransactionSchedules(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'list_analysis_rules',
      {
        title: 'List Analysis Rules',
        description:
          'List configured cash-flow analysis rules. Use get_cashflow_analysis_audit for date-range-specific rule effects.',
        inputSchema: {
          archived: z
            .boolean()
            .optional()
            .describe('Defaults to false. When true, list archived rules.'),
        },
        outputSchema: RuleListOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpReadService.listAnalysisRules(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'list_categorization_rules',
      {
        title: 'List Categorization Rules',
        description:
          'List read-only transaction categorization automation rules. This tool cannot create, update, apply, or archive rules.',
        inputSchema: {
          archived: z
            .boolean()
            .optional()
            .describe('Defaults to false. When true, list archived rules.'),
        },
        outputSchema: RuleListOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpReadService.listCategorizationRules(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'list_categorization_rule_recommendations',
      {
        title: 'List Categorization Rule Recommendations',
        description:
          'List pending categorization rule recommendations and latest generation state. This read-only tool cannot generate, accept, or dismiss recommendations.',
        inputSchema: {},
        outputSchema: CategorizationRecommendationsOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (_input, dependencies) =>
        toolResult(
          await dependencies.mcpReadService.listCategorizationRuleRecommendations(
            dependencies.userId,
          ),
        ),
    ),

    createSpliceTool(
      'list_manual_categorized_transaction_examples',
      {
        title: 'List Manual Categorized Transaction Examples',
        description:
          'List historical manually categorized transactions as evidence for MCP clients proposing deterministic categorization rules.',
        inputSchema: {
          categoryId: UuidSchema.optional().describe(
            'Optional target category ID to restrict manual examples.',
          ),
          query: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe('Optional merchant or transaction text search.'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe('Defaults to the backend evidence limit, maximum 100.'),
          ignoredCategoryIds: IgnoredCategoryIdsSchema,
        },
        outputSchema: ManualCategorizedExamplesOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpCategorizationService.listManualCategorizedTransactionExamples(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'list_rule_candidate_patterns',
      {
        title: 'List Rule Candidate Patterns',
        description:
          'List deterministic rule candidate patterns mined from historical manual categorization evidence. The MCP client decides which, if any, to propose to the user.',
        inputSchema: {
          fields: z
            .array(RuleCandidatePatternFieldSchema)
            .min(1)
            .optional()
            .describe('Optional transaction fields to mine for candidates.'),
          minAgreement: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe('Minimum historical manual agreements required.'),
          maxConflictRate: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe('Maximum acceptable manual conflict rate from 0 to 1.'),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe('Defaults to the backend candidate limit, maximum 100.'),
          ignoredCategoryIds: IgnoredCategoryIdsSchema,
        },
        outputSchema: RuleCandidatePatternsOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpCategorizationService.listRuleCandidatePatterns(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'preview_categorization_rule_draft',
      {
        title: 'Preview Categorization Rule Draft',
        description:
          'Preview a client-proposed categorization rule draft with the Splice rule engine. Use the returned previewToken only for the exact normalized draft the user approves.',
        inputSchema: {
          targetCategoryId: UuidSchema,
          priority: z.number().int().optional(),
          conditions: z.array(CategorizationRuleConditionSchema).min(1),
          ignoredManualCategoryIds: IgnoredCategoryIdsSchema,
        },
        outputSchema: CategorizationRuleDraftPreviewOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpCategorizationService.previewDraft(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'create_categorization_rule',
      {
        title: 'Create Categorization Rule',
        description:
          'Create a user-approved categorization rule from an exact previously previewed draft. Requires the previewToken returned by preview_categorization_rule_draft.',
        inputSchema: {
          name: z.string().trim().min(1).max(80),
          targetCategoryId: UuidSchema,
          priority: z.number().int().optional(),
          conditions: z.array(CategorizationRuleConditionSchema).min(1),
          previewToken: z.string().min(1),
        },
        outputSchema: CreateCategorizationRuleOutputSchema,
        requiredScopes: ['splice:write'],
        risk: { kind: 'mutating' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpCategorizationService.createRule(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'preview_categorization_rule_application',
      {
        title: 'Preview Categorization Rule Application',
        description:
          'Preview applying a saved categorization rule to existing transactions. Use the returned previewToken only for applying the same saved rule.',
        inputSchema: {
          ruleId: UuidSchema,
        },
        outputSchema: CategorizationRuleApplicationPreviewOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpCategorizationService.previewRuleApplication(
            dependencies.userId,
            input.ruleId,
          ),
        ),
    ),

    createSpliceTool(
      'apply_categorization_rule',
      {
        title: 'Apply Categorization Rule',
        description:
          'Apply a saved categorization rule to existing non-manual transactions after preview. Requires the previewToken returned by preview_categorization_rule_application.',
        inputSchema: {
          ruleId: UuidSchema,
          previewToken: z.string().min(1),
        },
        outputSchema: ApplyCategorizationRuleOutputSchema,
        requiredScopes: ['splice:write'],
        risk: { kind: 'destructive', idempotent: true },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpCategorizationService.applyRule(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'get_cashflow_analysis',
      {
        title: 'Get Cash Flow Analysis',
        description:
          'Get cash-flow analysis grouped by category for an inclusive activity date range. Applies analysis rules, neutralization, pending transactions, and currency conversion. All returned money amounts are major units.',
        inputSchema: {
          startDate: DateStringSchema.describe(
            'Inclusive activity start date in YYYY-MM-DD.',
          ),
          endDate: DateStringSchema.describe(
            'Inclusive activity end date in YYYY-MM-DD.',
          ),
        },
        outputSchema: CashflowAnalysisOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) => {
        assertDateRange(input.startDate, input.endDate);

        return toolResult(
          mcpCashflowAnalysis(
            await dependencies.transactionAnalysisService.getAnalysis(
              input.startDate,
              input.endDate,
              dependencies.userId,
            ),
          ),
        );
      },
    ),

    createSpliceTool(
      'list_cashflow_category_transactions',
      {
        title: 'List Cash Flow Category Transactions',
        description:
          'List unmatched real transactions behind a cash-flow category drilldown. Uses the same analysis rules and neutralization pipeline as get_cashflow_analysis.',
        inputSchema: {
          startDate: DateStringSchema.describe(
            'Inclusive activity start date in YYYY-MM-DD.',
          ),
          endDate: DateStringSchema.describe(
            'Inclusive activity end date in YYYY-MM-DD.',
          ),
          categoryPrimary: z
            .string()
            .describe(
              'Primary category to drill into, for example FOOD_AND_DRINK or UNCATEGORIZED.',
            ),
          flowDirection: z.enum(['inflow', 'outflow']),
        },
        outputSchema: CashflowCategoryTransactionsOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) => {
        assertDateRange(input.startDate, input.endDate);

        return toolResult({
          data: await dependencies.transactionAnalysisService.getCategoryTransactions(
            input.startDate,
            input.endDate,
            input.categoryPrimary,
            input.flowDirection,
            dependencies.userId,
          ),
          query: input,
        });
      },
    ),

    createSpliceTool(
      'get_cashflow_analysis_audit',
      {
        title: 'Get Cash Flow Analysis Audit',
        description:
          'Get analysis rule audit rows for an inclusive activity date range, including exclusions and neutralized pairs that affect the report range.',
        inputSchema: {
          startDate: DateStringSchema.describe(
            'Inclusive activity start date in YYYY-MM-DD.',
          ),
          endDate: DateStringSchema.describe(
            'Inclusive activity end date in YYYY-MM-DD.',
          ),
        },
        outputSchema: CashflowAuditOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) => {
        assertDateRange(input.startDate, input.endDate);

        return toolResult(
          await dependencies.transactionAnalysisService.getAnalysisAudit(
            input.startDate,
            input.endDate,
            dependencies.userId,
          ),
        );
      },
    ),

    createSpliceTool(
      'show_cashflow_explorer',
      {
        title: 'Show Cashflow Explorer',
        description:
          'Return an MCP Apps UI for exploring rule-adjusted cash-flow totals and category drilldowns, with structured fallback data.',
        inputSchema: {
          startDate: DateStringSchema,
          endDate: DateStringSchema,
        },
        outputSchema: AppToolOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
        ui: {
          resourceUri: APP_RESOURCES.cashflowExplorer.resourceUri,
          visibility: ['model', 'app'],
        },
      },
      async (input, dependencies) => {
        assertDateRange(input.startDate, input.endDate);
        const analysis = mcpCashflowAnalysis(
          await dependencies.transactionAnalysisService.getAnalysis(
            input.startDate,
            input.endDate,
            dependencies.userId,
          ),
        );

        return appToolResult(
          APP_RESOURCES.cashflowExplorer,
          'Use the structured cash-flow analysis data to summarize income, outflows, categories, and rule-adjusted totals.',
          analysis,
        );
      },
    ),

    createSpliceTool(
      'show_projection_scenario_modeler',
      {
        title: 'Show Projection Scenario Modeler',
        description:
          'Return an MCP Apps UI for collecting non-persistent projection assumptions and reviewing current projection baselines.',
        inputSchema: {},
        outputSchema: AppToolOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
        ui: {
          resourceUri: APP_RESOURCES.projectionScenarioModeler.resourceUri,
          visibility: ['model', 'app'],
        },
      },
      async (_input, dependencies) =>
        appToolResult(
          APP_RESOURCES.projectionScenarioModeler,
          'Collect non-sensitive projection assumptions, then use get_accounts_snapshot, list_balance_snapshots, and list_recurring_manual_transaction_schedules for baselines.',
          {
            accounts:
              await dependencies.accountsSurfaceService.getAccountsSnapshot(
                dependencies.userId,
              ),
            recurringSchedules:
              await dependencies.mcpReadService.listRecurringManualTransactionSchedules(
                dependencies.userId,
                {},
              ),
          },
        ),
    ),

    createSpliceTool(
      'show_portfolio_viewer',
      {
        title: 'Show Portfolio Viewer',
        description:
          'Return an MCP Apps UI for latest holdings and investment activity, with structured fallback data.',
        inputSchema: {
          accountIds: z.array(UuidSchema).optional(),
        },
        outputSchema: AppToolOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
        ui: {
          resourceUri: APP_RESOURCES.portfolioViewer.resourceUri,
          visibility: ['model', 'app'],
        },
      },
      async (input, dependencies) =>
        appToolResult(
          APP_RESOURCES.portfolioViewer,
          'Use holdings and investment activity fallback data to summarize portfolio positions and recent investment transactions.',
          {
            holdings: await dependencies.mcpReadService.listInvestmentHoldings(
              dependencies.userId,
              {
                accountIds: input.accountIds,
              },
            ),
            activity: await dependencies.mcpReadService.listInvestmentActivity(
              dependencies.userId,
              {
                accountIds: input.accountIds,
                pageSize: 25,
              },
            ),
          },
        ),
    ),

    createSpliceTool(
      'show_category_rule_workbench',
      {
        title: 'Show Category Rule Workbench',
        description:
          'Return an MCP Apps UI for read-only category, analysis rule, categorization rule, and recommendation context.',
        inputSchema: {},
        outputSchema: AppToolOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
        ui: {
          resourceUri: APP_RESOURCES.categoryRuleWorkbench.resourceUri,
          visibility: ['model', 'app'],
        },
      },
      async (_input, dependencies) =>
        appToolResult(
          APP_RESOURCES.categoryRuleWorkbench,
          'Use category and rule fallback data to explain category metadata, cash-flow rules, categorization automation, and pending recommendations.',
          {
            categories: await dependencies.mcpReadService.listCategories(
              dependencies.userId,
              {},
            ),
            analysisRules: await dependencies.mcpReadService.listAnalysisRules(
              dependencies.userId,
              {},
            ),
            categorizationRules:
              await dependencies.mcpReadService.listCategorizationRules(
                dependencies.userId,
                {},
              ),
            recommendations:
              await dependencies.mcpReadService.listCategorizationRuleRecommendations(
                dependencies.userId,
              ),
          },
        ),
    ),

    createSpliceTool(
      'collect_projection_assumptions',
      {
        title: 'Collect Projection Assumptions',
        description:
          'Collect non-sensitive, non-persistent projection assumptions through the official MCP input-required/resume flow.',
        inputSchema: {
          suggestedHorizonDate: DateStringSchema.optional(),
          goalName: z.string().optional(),
        },
        outputSchema: ProjectionAssumptionsOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      (input, _dependencies, sdkContext, requestContext) => {
        const fallback = {
          fields: [
            'horizonDate',
            'goalName',
            'recurringIncomeAdjustment',
            'recurringExpenseAdjustment',
            'oneTimeEventsText',
            'expectedAnnualReturnPercent',
          ],
          prompt:
            'Ask the user for a projection horizon date, optional goal name, recurring income/expense adjustments, one-time events, and expected annual return. Do not ask for credentials or payment details.',
          suggestions: {
            horizonDate: input.suggestedHorizonDate,
            goalName: input.goalName,
          },
        };

        if (!requestContext.client.inputRequired.formElicitation) {
          return toolResult({
            source: 'fallback' as const,
            inputRequired: {
              ...fallback,
              action: 'unsupported' as const,
            },
          });
        }

        const responses = sdkContext.mcpReq.inputResponses;
        const response = inputResponse(responses, PROJECTION_INPUT_KEY);
        const assumptions = acceptedContent(
          responses,
          PROJECTION_INPUT_KEY,
          ProjectionAssumptionsInputSchema,
        );

        if (assumptions) {
          return toolResult({
            source: 'elicited' as const,
            assumptions,
          });
        }

        if (
          response.kind === 'elicit' &&
          (response.action === 'cancel' || response.action === 'decline')
        ) {
          return toolResult({
            source: 'fallback' as const,
            inputRequired: {
              ...fallback,
              action: response.action,
            },
          });
        }

        return inputRequired({
          inputRequests: {
            [PROJECTION_INPUT_KEY]: inputRequired.elicit({
              message:
                'Provide non-sensitive projection assumptions for this in-session Splice scenario. These values will not be saved.',
              requestedSchema: ProjectionAssumptionsFormSchema,
            }),
          },
        });
      },
    ),
  ],
  extend: registerSpliceMcpExtensions,
});

validateMcpApps(spliceMcpDefinition, { profile: 'openai-submission' });
