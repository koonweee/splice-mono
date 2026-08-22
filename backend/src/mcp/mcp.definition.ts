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
import type { McpPortfolioVisualizationService } from './mcp-portfolio-visualization.service';
import { APP_RESOURCES, MCP_APP_RESOURCES, appToolResult } from './mcp-apps';
import {
  ApplyCategorizationRuleOutputSchema,
  AccountsSnapshotOutputSchema,
  BalanceHistoryOutputSchema,
  CashflowAnalysisOutputSchema,
  CashflowAuditOutputSchema,
  CashflowCategoryTransactionsOutputSchema,
  CashFlowVisualizationOutputSchema,
  CategoriesOutputSchema,
  CategorizationRuleApplicationPreviewOutputSchema,
  CategorizationRuleChangePreviewOutputSchema,
  CategorizationRuleDraftPreviewOutputSchema,
  CategorizationRecommendationsOutputSchema,
  CreateCategorizationRuleOutputSchema,
  GetUserContextOutputSchema,
  InvestmentHoldingsOutputSchema,
  ManualCategorizedExamplesOutputSchema,
  PaginatedListOutputSchema,
  PortfolioVisualizationOutputSchema,
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
  mcpCashFlowAdjustmentSummary,
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
  readonly mcpPortfolioVisualizationService: McpPortfolioVisualizationService;
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
const CategorizationRuleEditSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    priority: z.number().int().optional(),
    targetCategoryId: UuidSchema.optional(),
    conditions: z.array(CategorizationRuleConditionSchema).min(1).optional(),
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'Provide at least one rule property to edit',
  });
const LIST_TRANSACTIONS_DESCRIPTION = [
  'Raw transaction data for targeted merchant queries, largest-transaction lists, custom patterns, or analysis where the cash-flow abstraction is insufficient.',
  'This is not the default for a broad user-facing spending, expense, income, or cash-flow overview; prefer visualize_cash_flow for those questions.',
  'Results use cursor pagination and activityDate, which respects reportingDateOverride when set. Page until pageInfo.hasMore is false before making complete-range claims.',
  'All money amounts are major units; always use convertedAmount for cross-currency comparisons.',
].join(' ');
const GET_CASHFLOW_ANALYSIS_DESCRIPTION = [
  'Structured cash-flow data/analysis primitive for reasoning, calculations, prose-only answers, or additional analysis beyond the Cash Flow UI.',
  'Returns category-grouped analysis for an inclusive activity date range and applies analysis rules, neutralization, pending transactions, and currency conversion. All money amounts are major units.',
  'Do not prefer this over visualize_cash_flow for broad user-facing questions such as "What were my expenses like last month?" or "How did I spend this month?" unless the user explicitly requests prose only, no visualization/UI, or asks for a narrow factual answer.',
  'It may still be called after rendering for deeper follow-up reasoning.',
].join(' ');
const LIST_CASHFLOW_CATEGORY_TRANSACTIONS_DESCRIPTION = [
  'Drill into unmatched real transactions for one selected or specific category and direction in a cash-flow report.',
  'Use for focused follow-ups such as "Why was food so high?" after an overview, or when the user directly asks about a category; this is not a broad spending overview tool.',
  'Uses the same analysis rules and neutralization pipeline as get_cashflow_analysis.',
].join(' ');
const GET_CASHFLOW_ANALYSIS_AUDIT_DESCRIPTION = [
  'Audit primitive for debugging or explaining cash-flow exclusions, analysis-rule effects, and neutralized pairs for an inclusive activity date range.',
  'Use when the user asks how a report was calculated or why rows were excluded; this is not a spending overview or default presentation tool.',
].join(' ');
const VISUALIZE_CASH_FLOW_DESCRIPTION = [
  "Preferred/default tool for broad user-facing questions about the authenticated user's actual spending, expenses, income, or cash flow over a date range.",
  'Resolve relative dates with get_user_context before calling, render the Cash Flow UI as the primary response, and optionally add a concise prose summary afterward.',
  'Use direction "outflow" for spending or expense questions and "inflow" for income questions. Supports exact-period comparisons and category focus.',
  'Default examples: "What were my expenses like last month?"; "How much did I spend in July?"; "Where did my money go this month?"; "Show me my spending for the last 30 days."; "How does July spending compare with June?"; "What was my income like last month?".',
  'Do not call when the user explicitly requests prose only, no visualization, or no UI; for a narrow merchant/transaction fact; for conceptual or hypothetical questions; or for capability discovery.',
  'Negative examples: "What does positive cash flow mean?"; "How much did I spend at Uber?"; "What was my total spending last month? Answer in prose and do not render a visualization."; "What visualizations can Splice render?".',
  'Rendering does not prevent follow-up data calls: use category focus and/or list_cashflow_category_transactions when the user asks why a category was high, and other data tools when deeper analysis is needed.',
].join(' ');
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
  'get_categorization_rule',
  'list_categorization_rule_recommendations',
  'list_manual_categorized_transaction_examples',
  'list_rule_candidate_patterns',
  'preview_categorization_rule_draft',
  'create_categorization_rule',
  'preview_categorization_rule_edit',
  'edit_categorization_rule',
  'preview_categorization_rule_archive',
  'archive_categorization_rule',
  'preview_categorization_rule_restore',
  'restore_categorization_rule',
  'preview_categorization_rule_application',
  'apply_categorization_rule',
  'get_cashflow_analysis',
  'list_cashflow_category_transactions',
  'get_cashflow_analysis_audit',
  'visualize_cash_flow',
  'visualize_portfolio',
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
        description: LIST_TRANSACTIONS_DESCRIPTION,
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
          'List transaction categorization automation rules, active by default or archived when archived=true. Lower priority numbers win when active rules overlap. Use get_categorization_rule for one exact rule.',
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
      'get_categorization_rule',
      {
        title: 'Get Categorization Rule',
        description:
          'Inspect one active or archived categorization rule, including its conditions, target category, priority, archive state, and updatedAt concurrency version. This read does not preview or mutate anything.',
        inputSchema: {
          ruleId: UuidSchema,
        },
        outputSchema: CreateCategorizationRuleOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult({
          rule: await dependencies.mcpCategorizationService.getRule(
            dependencies.userId,
            input.ruleId,
          ),
        }),
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
          'Create a new user-approved categorization rule from an exact previously previewed draft. Do not use this to change an existing rule; use preview_categorization_rule_edit then edit_categorization_rule. Creation affects future categorization only and requires the previewToken from preview_categorization_rule_draft.',
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
      'preview_categorization_rule_edit',
      {
        title: 'Preview Categorization Rule Edit',
        description:
          'Preview changing editable properties of one existing rule: name, conditions, target category, or priority. The impact compares current versus proposed matching and precedence on existing transactions, but the edit itself affects future categorization only and never rewrites historical assignments. Use the returned normalizedChanges and previewToken for edit_categorization_rule. Do not use for archive/restore or historical application.',
        inputSchema: {
          ruleId: UuidSchema,
          changes: CategorizationRuleEditSchema,
        },
        outputSchema: CategorizationRuleChangePreviewOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpCategorizationService.previewRuleEdit(
            dependencies.userId,
            { ruleId: input.ruleId, ...input.changes },
          ),
        ),
    ),

    createSpliceTool(
      'edit_categorization_rule',
      {
        title: 'Edit Categorization Rule',
        description:
          'Commit the exact existing-rule edit previously previewed by preview_categorization_rule_edit. Requires the matching previewToken and fails if the rule changed concurrently. This changes future matching only; use preview_categorization_rule_application and apply_categorization_rule separately for historical transactions.',
        inputSchema: {
          ruleId: UuidSchema,
          changes: CategorizationRuleEditSchema,
          previewToken: z.string().trim().min(1),
        },
        outputSchema: CreateCategorizationRuleOutputSchema,
        requiredScopes: ['splice:write'],
        risk: { kind: 'mutating' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpCategorizationService.editRule(
            dependencies.userId,
            {
              ruleId: input.ruleId,
              ...input.changes,
              previewToken: input.previewToken,
            },
          ),
        ),
    ),

    createSpliceTool(
      'preview_categorization_rule_archive',
      {
        title: 'Preview Categorization Rule Archive',
        description:
          'Preview disabling one active categorization rule. Archiving removes it from future matching and reveals any fallback winners, while leaving every existing transaction category and rule-assignment record untouched. Use the returned previewToken only with archive_categorization_rule.',
        inputSchema: { ruleId: UuidSchema },
        outputSchema: CategorizationRuleChangePreviewOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpCategorizationService.previewRuleArchive(
            dependencies.userId,
            input.ruleId,
          ),
        ),
    ),

    createSpliceTool(
      'archive_categorization_rule',
      {
        title: 'Archive Categorization Rule',
        description:
          'Disable an active categorization rule after preview_categorization_rule_archive. Requires its previewToken and fails on concurrent changes. Existing transaction categories remain untouched; the archived rule stops participating in future categorization.',
        inputSchema: {
          ruleId: UuidSchema,
          previewToken: z.string().trim().min(1),
        },
        outputSchema: CreateCategorizationRuleOutputSchema,
        requiredScopes: ['splice:write'],
        risk: { kind: 'destructive', idempotent: true },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpCategorizationService.archiveRule(
            dependencies.userId,
            input,
          ),
        ),
    ),

    createSpliceTool(
      'preview_categorization_rule_restore',
      {
        title: 'Preview Categorization Rule Restore',
        description:
          'Preview re-enabling one archived categorization rule, including its future matching and precedence impact. Existing transaction categories remain untouched. Use the returned previewToken only with restore_categorization_rule.',
        inputSchema: { ruleId: UuidSchema },
        outputSchema: CategorizationRuleChangePreviewOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpCategorizationService.previewRuleRestore(
            dependencies.userId,
            input.ruleId,
          ),
        ),
    ),

    createSpliceTool(
      'restore_categorization_rule',
      {
        title: 'Restore Categorization Rule',
        description:
          'Re-enable an archived categorization rule after preview_categorization_rule_restore. Requires its previewToken, validates active-category and duplicate-rule constraints, and fails on concurrent changes. Restoration affects future matching only.',
        inputSchema: {
          ruleId: UuidSchema,
          previewToken: z.string().trim().min(1),
        },
        outputSchema: CreateCategorizationRuleOutputSchema,
        requiredScopes: ['splice:write'],
        risk: { kind: 'mutating', idempotent: true },
      },
      async (input, dependencies) =>
        toolResult(
          await dependencies.mcpCategorizationService.restoreRule(
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
          'Preview the separate historical operation that applies a saved active rule to existing transactions where it is the winning rule by priority. Manual transactions and manual categories are never overwritten. This does not create, edit, archive, or restore a rule. Use the returned previewToken only for apply_categorization_rule.',
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
          'Apply a saved active rule to historical non-manual transactions where it wins active-rule precedence, after preview_categorization_rule_application. Requires that exact previewToken and fails if the rule changed concurrently. It never overwrites manual categorization, does not edit the rule itself, and does not clear older assignments that no longer match.',
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
        description: GET_CASHFLOW_ANALYSIS_DESCRIPTION,
        inputSchema: {
          startDate: DateStringSchema.describe(
            'Inclusive activity start date in YYYY-MM-DD. Resolve relative dates using get_user_context.today and timezone.',
          ),
          endDate: DateStringSchema.describe(
            'Inclusive activity end date in YYYY-MM-DD. Resolve relative dates using get_user_context.today and timezone.',
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
        description: LIST_CASHFLOW_CATEGORY_TRANSACTIONS_DESCRIPTION,
        inputSchema: {
          startDate: DateStringSchema.describe(
            'Inclusive activity start date in YYYY-MM-DD. Reuse the exact overview range or resolve it using get_user_context.',
          ),
          endDate: DateStringSchema.describe(
            'Inclusive activity end date in YYYY-MM-DD. Reuse the exact overview range or resolve it using get_user_context.',
          ),
          categoryPrimary: z
            .string()
            .describe(
              'Primary category to drill into, for example FOOD_AND_DRINK or UNCATEGORIZED.',
            ),
          flowDirection: z
            .enum(['inflow', 'outflow'])
            .describe(
              'Use the same direction as the overview: outflow for spending/expenses and inflow for income.',
            ),
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
        description: GET_CASHFLOW_ANALYSIS_AUDIT_DESCRIPTION,
        inputSchema: {
          startDate: DateStringSchema.describe(
            'Inclusive activity start date in YYYY-MM-DD. Reuse the exact report range or resolve it using get_user_context.',
          ),
          endDate: DateStringSchema.describe(
            'Inclusive activity end date in YYYY-MM-DD. Reuse the exact report range or resolve it using get_user_context.',
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
      'visualize_cash_flow',
      {
        title: 'Visualize Cash Flow',
        description: VISUALIZE_CASH_FLOW_DESCRIPTION,
        inputSchema: {
          startDate: DateStringSchema.describe(
            'Inclusive current-period start date in YYYY-MM-DD. Resolve relative dates first using get_user_context.today and timezone.',
          ),
          endDate: DateStringSchema.describe(
            'Inclusive current-period end date in YYYY-MM-DD. Resolve relative dates first using get_user_context.today and timezone.',
          ),
          direction: z
            .enum(['outflow', 'inflow'])
            .optional()
            .default('outflow')
            .describe(
              'Category direction to emphasize. Use outflow for spending or expense questions and inflow for income questions. Defaults to outflow for general cash-flow overviews.',
            ),
          focusCategoryPrimary: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe(
              'Optional exact primary category identity for a focused follow-up, such as explaining why food spending was high. Omit for the initial broad overview.',
            ),
          comparison: z
            .object({
              startDate: DateStringSchema.describe(
                'Inclusive comparison-period start date in YYYY-MM-DD.',
              ),
              endDate: DateStringSchema.describe(
                'Inclusive comparison-period end date in YYYY-MM-DD.',
              ),
            })
            .strict()
            .optional()
            .describe(
              'Optional exact comparison range for questions comparing periods. Resolve relative periods first; both dates are required and no period is inferred.',
            ),
        },
        outputSchema: CashFlowVisualizationOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
        ui: {
          resourceUri: APP_RESOURCES.cashFlow.resourceUri,
          visibility: ['model', 'app'],
        },
      },
      async (input, dependencies) => {
        assertDateRange(input.startDate, input.endDate);
        if (input.comparison) {
          assertDateRange(input.comparison.startDate, input.comparison.endDate);
        }

        const loadPeriod = async (startDate: string, endDate: string) => {
          const [analysis, audit] = await Promise.all([
            dependencies.transactionAnalysisService.getAnalysis(
              startDate,
              endDate,
              dependencies.userId,
            ),
            dependencies.transactionAnalysisService.getAnalysisAudit(
              startDate,
              endDate,
              dependencies.userId,
            ),
          ]);

          return {
            analysis: mcpCashflowAnalysis(analysis),
            adjustments: mcpCashFlowAdjustmentSummary(audit),
          };
        };

        const [current, comparison] = await Promise.all([
          loadPeriod(input.startDate, input.endDate),
          input.comparison
            ? loadPeriod(input.comparison.startDate, input.comparison.endDate)
            : Promise.resolve(undefined),
        ]);
        const categories =
          input.direction === 'inflow'
            ? current.analysis.inflows
            : current.analysis.outflows;
        const focusCategoryPrimary = categories.some(
          (category) => category.primaryCategory === input.focusCategoryPrimary,
        )
          ? input.focusCategoryPrimary
          : undefined;

        return appToolResult(
          APP_RESOURCES.cashFlow,
          'Use the exact current and optional comparison periods, presentation focus, category breakdowns, and adjustment counts to answer the cash-flow question when the App cannot render.',
          {
            presentation: {
              direction: input.direction,
              ...(focusCategoryPrimary ? { focusCategoryPrimary } : undefined),
            },
            current,
            comparison,
          },
        );
      },
    ),

    createSpliceTool(
      'visualize_portfolio',
      {
        title: 'Visualize Portfolio',
        description:
          'Visualize current portfolio value, ownership, allocation, exposure, and concentration when a visual answer materially helps. Do not call for capability discovery, metadata questions, hypothetical discussion, investment activity, or simple holding facts that prose answers clearly.',
        inputSchema: {
          accountIds: z
            .array(UuidSchema)
            .min(1)
            .max(100)
            .optional()
            .describe(
              'Optional non-empty subset of user-owned investment account IDs selected by the conversation.',
            ),
        },
        outputSchema: PortfolioVisualizationOutputSchema,
        requiredScopes: ['splice:read'],
        risk: { kind: 'read' },
        ui: {
          resourceUri: APP_RESOURCES.portfolio.resourceUri,
          visibility: ['model', 'app'],
        },
      },
      async (input, dependencies) =>
        appToolResult(
          APP_RESOURCES.portfolio,
          'Use the complete current USD portfolio total, ranked security positions, allocation basis points, contributing-account evidence, and snapshot range to answer the portfolio question when the App cannot render.',
          await dependencies.mcpPortfolioVisualizationService.visualize(
            dependencies.userId,
            input.accountIds,
          ),
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
