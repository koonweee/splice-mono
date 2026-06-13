import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { AccountsSurfaceService } from '../account/accounts-surface.service';
import { BalanceHistorySurfaceService } from '../balance-query/balance-history-surface.service';
import { TransactionAnalysisService } from '../transaction-analysis/transaction-analysis.service';
import { TransactionsSurfaceService } from '../transaction/transactions-surface.service';
import { CategorizationRuleConditionSchema } from '../types/CategorizationRule';
import { getDecimalPlaces, MoneySign } from '../types/MoneyWithSign';
import type {
  CategoryAggregate,
  TransactionAnalysisResponse,
} from '../types/TransactionAnalysis';
import { UserService } from '../user/user.service';
import { normalizeMcpMoney, type McpMoney } from './mcp-money';
import { McpReadService } from './mcp-read.service';
import {
  APP_RESOURCES,
  appToolMeta,
  appToolResult,
  registerMcpAppResources,
} from './mcp-apps';
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
  RuleListOutputSchema,
  RuleCandidatePatternsOutputSchema,
  SearchTransactionsOutputSchema,
} from './mcp-schemas';
import { McpCategorizationService } from './mcp-categorization.service';

const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
const CurrencySchema = z
  .string()
  .trim()
  .min(3)
  .max(10)
  .describe('Currency code for major-unit money amounts, e.g. USD or SGD.');
const UuidSchema = z.string().uuid();
const CategoryIdFilterSchema = z.union([
  UuidSchema,
  z.literal('UNCATEGORIZED'),
]);
const CursorSchema = z
  .string()
  .optional()
  .describe('Opaque cursor returned by the previous pageInfo.nextCursor.');
const DetailLevelSchema = z.enum(['summary', 'standard', 'detailed']);
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

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const ADDITIVE_WRITE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const DESTRUCTIVE_IDEMPOTENT_WRITE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

const MCP_GUIDE = `# Splice MCP Guide

Use get_user_context first to get today, timezone, and the user's preferred currency.

For cash-flow totals and category breakdowns, call get_cashflow_analysis. The summary applies the user's analysis rules and neutralization lookaround setting.

For custom spending patterns not covered by get_cashflow_analysis, call list_transactions for the full date range and keep paging until pageInfo.hasMore is false. Do not infer totals from a partial page unless you clearly say it is a sample.

For projections, use get_accounts_snapshot for current state and list_balance_snapshots for historical account-level baselines. Ask the user for future income, expense, return, allocation, or one-time-event assumptions; do not invent them.

Every tool returns structuredContent and declares an outputSchema. Use structuredContent for validation and parsing; text content mirrors the same JSON for older clients. Inspect tool annotations before calling mutation tools.

Available prompts: monthly_cashflow_review, projection_builder, category_cleanup_audit, portfolio_snapshot, and tax_or_refund_anomaly_review. Prompts provide workflow guidance and still require clients to call the listed tools.

Prefer resource templates for reusable report reads when a client asks for a durable report URI: splice://reports/cashflow/{startDate}/{endDate}, splice://accounts/{accountId}/snapshot, splice://categories/taxonomy, splice://rules/analysis, and splice://portfolio/holdings/latest.

MCP Apps are progressive enhancement. Use app-backed show_* tools when the host supports MCP Apps; otherwise use each tool's fallback structuredContent and continue with text. App panes are interactive and read-only: Cashflow Explorer can refresh date ranges, drill into categories, and load audit effects; Projection Scenario Modeler can calculate in-session assumptions without saving them; Portfolio Viewer can filter, sort, and page investment reads; Category Rule Workbench can search, filter, inspect details, and load audit effects without accepting, dismissing, applying, creating, editing, or archiving rules. App resources declare restrictive CSP metadata and call only existing read-only MCP tools through the host bridge.

Projection assumption elicitation is optional and non-persistent. If the client does not support elicitation, collect_projection_assumptions returns an inputRequired object the client can ask the user about normally.

Use list_investment_holdings for current or date-specific investment positions. Use list_investment_activity for investment transactions. Investment activity is separate from banking/manual transactions and is not included in get_cashflow_analysis.

Use list_recurring_manual_transaction_schedules as user-known projection assumptions before asking the user to restate recurring income or expenses. Schedules are projection inputs, not generated future transactions.

Use list_analysis_rules to explain configured cash-flow rules, then get_cashflow_analysis_audit for date-range-specific rule effects. Use list_categorization_rules and list_categorization_rule_recommendations to explain category automation context. MCP personal access tokens are full-scope automation keys. Trusted clients can inspect manual examples and candidate patterns, preview a proposed categorization rule draft, create the user-approved rule with the matching preview token, preview a saved rule application, and apply it with the matching preview token. Treat Splice preview counts as authoritative; do not rely on client-estimated impact. Rule application never overwrites manual transactions or manual category assignments.

Use reportingCurrency from get_user_context.currency unless the user asks for another currency. Compare amounts using convertedAmount. Native amount preserves the original transaction currency.

All MCP money amounts are major units and always include currency and sign. Amount filters require a currency and are applied after conversion into reportingCurrency.

Transaction date ranges use activityDate (reportingDateOverride when set, otherwise authorizedDate when available, otherwise providerDate). Dates are inclusive YYYY-MM-DD. Resolve relative dates using get_user_context.today and timezone. Raw provider and authorized dates remain available for audit. Provider category hints are guidance only; category filters are user-category filters. Use list_categories for exact category IDs when needed.

Pending transactions are included in cash-flow analysis and excluded from list_transactions by default unless includePending is true. State whether pending transactions were included.`;

function majorUnitAmount(amount: number, currency: string): number {
  const decimals = getDecimalPlaces(currency);

  return Number((Math.abs(amount) / Math.pow(10, decimals)).toFixed(decimals));
}

function mcpMoneyFromSmallestUnit(
  amount: number,
  currency: string,
  sign: MoneySign,
): McpMoney {
  return {
    amount: majorUnitAmount(amount, currency),
    currency,
    sign,
  };
}

function mcpMoneyFromSignedSmallestUnit(
  amount: number,
  currency: string,
): McpMoney {
  return mcpMoneyFromSmallestUnit(
    amount,
    currency,
    amount < 0 ? MoneySign.NEGATIVE : MoneySign.POSITIVE,
  );
}

function mcpCategoryAggregate(
  category: CategoryAggregate,
  sign: MoneySign,
): Omit<CategoryAggregate, 'totalAmount'> & { totalAmount: McpMoney } {
  return {
    ...category,
    totalAmount: mcpMoneyFromSmallestUnit(
      category.totalAmount,
      category.currency,
      sign,
    ),
  };
}

function mcpCashflowAnalysis(analysis: TransactionAnalysisResponse) {
  return {
    startDate: analysis.startDate,
    endDate: analysis.endDate,
    currency: analysis.currency,
    totals: {
      totalInflow: mcpMoneyFromSmallestUnit(
        analysis.totalInflow,
        analysis.currency,
        MoneySign.POSITIVE,
      ),
      totalOutflow: mcpMoneyFromSmallestUnit(
        analysis.totalOutflow,
        analysis.currency,
        MoneySign.NEGATIVE,
      ),
      netFlow: mcpMoneyFromSignedSmallestUnit(
        analysis.netFlow,
        analysis.currency,
      ),
      uncategorizedInflow: mcpMoneyFromSmallestUnit(
        analysis.uncategorizedInflow,
        analysis.currency,
        MoneySign.POSITIVE,
      ),
      uncategorizedOutflow: mcpMoneyFromSmallestUnit(
        analysis.uncategorizedOutflow,
        analysis.currency,
        MoneySign.NEGATIVE,
      ),
    },
    inflows: analysis.inflows.map((category) =>
      mcpCategoryAggregate(category, MoneySign.POSITIVE),
    ),
    outflows: analysis.outflows.map((category) =>
      mcpCategoryAggregate(category, MoneySign.NEGATIVE),
    ),
  };
}

function assertDateRange(startDate: string, endDate: string): void {
  if (startDate > endDate) {
    throw new BadRequestException(
      'startDate must be before or equal to endDate',
    );
  }
}

function toolResult(data: unknown): CallToolResult {
  const structuredContent = normalizeMcpMoney(data) as Record<string, unknown>;

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

function jsonResource(uri: URL, data: unknown) {
  const structuredContent = normalizeMcpMoney(data);

  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
  };
}

function promptText(text: string) {
  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text,
        },
      },
    ],
  };
}

function promptDateRange(input: {
  startDate?: string;
  endDate?: string;
  reportingCurrency?: string;
  detailLevel?: string;
}): string {
  const range =
    input.startDate && input.endDate
      ? `${input.startDate} through ${input.endDate}`
      : 'the requested date range';
  const currency = input.reportingCurrency
    ? ` Use ${input.reportingCurrency} as reportingCurrency where tools require it.`
    : ' Use get_user_context.currency where tools require reportingCurrency.';
  const detail = input.detailLevel
    ? ` Detail level: ${input.detailLevel}.`
    : '';

  return `${range}.${currency}${detail}`;
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

@Injectable()
export class SpliceMcpService {
  private static readonly TOOL_NAMES = [
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

  constructor(
    private readonly userService: UserService,
    private readonly accountsSurfaceService: AccountsSurfaceService,
    private readonly balanceHistorySurfaceService: BalanceHistorySurfaceService,
    private readonly transactionsSurfaceService: TransactionsSurfaceService,
    private readonly mcpReadService: McpReadService,
    private readonly mcpCategorizationService: McpCategorizationService,
    private readonly transactionAnalysisService: TransactionAnalysisService,
  ) {}

  getToolNames(): readonly string[] {
    return SpliceMcpService.TOOL_NAMES;
  }

  createServer(userId: string): McpServer {
    const server = new McpServer({
      name: 'splice',
      version: '1.0.0',
    });

    server.registerResource(
      'splice_mcp_guide',
      'splice://mcp-guide',
      {
        title: 'Splice MCP Guide',
        description:
          'Guidance for using Splice MCP tools safely for spending analysis and projections.',
        mimeType: 'text/markdown',
      },
      (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: MCP_GUIDE,
          },
        ],
      }),
    );

    registerMcpAppResources(server);

    server.registerResource(
      'cashflow_report',
      new ResourceTemplate('splice://reports/cashflow/{startDate}/{endDate}', {
        list: undefined,
      }),
      {
        title: 'Cashflow Report',
        description:
          'Rule-adjusted cash-flow report for an inclusive activity date range.',
        mimeType: 'application/json',
      },
      async (uri, variables) => {
        const startDate = String(variables.startDate);
        const endDate = String(variables.endDate);
        DateStringSchema.parse(startDate);
        DateStringSchema.parse(endDate);
        assertDateRange(startDate, endDate);

        return jsonResource(
          uri,
          mcpCashflowAnalysis(
            await this.transactionAnalysisService.getAnalysis(
              startDate,
              endDate,
              userId,
            ),
          ),
        );
      },
    );

    server.registerResource(
      'account_snapshot_report',
      new ResourceTemplate('splice://accounts/{accountId}/snapshot', {
        list: undefined,
      }),
      {
        title: 'Account Snapshot',
        description: 'Single-account current snapshot from Splice accounts.',
        mimeType: 'application/json',
      },
      async (uri, variables) => {
        const accountId = UuidSchema.parse(String(variables.accountId));
        const snapshot =
          await this.accountsSurfaceService.getAccountsSnapshot(userId);
        const accounts = Array.isArray(snapshot.accounts)
          ? snapshot.accounts
          : [];
        const account = accounts.find(
          (candidate: { id?: string }) => candidate.id === accountId,
        );
        if (!account) {
          throw new NotFoundException('Account not found');
        }

        return jsonResource(uri, { account });
      },
    );

    server.registerResource(
      'categories_taxonomy',
      new ResourceTemplate('splice://categories/taxonomy', {
        list: undefined,
      }),
      {
        title: 'Category Taxonomy',
        description: 'User category taxonomy with IDs, labels, and colors.',
        mimeType: 'application/json',
      },
      async (uri) =>
        jsonResource(uri, await this.mcpReadService.listCategories(userId, {})),
    );

    server.registerResource(
      'analysis_rules_report',
      new ResourceTemplate('splice://rules/analysis', {
        list: undefined,
      }),
      {
        title: 'Rules Analysis',
        description:
          'Read-only analysis and categorization rules for the current user.',
        mimeType: 'application/json',
      },
      async (uri) =>
        jsonResource(uri, {
          analysisRules: await this.mcpReadService.listAnalysisRules(
            userId,
            {},
          ),
          categorizationRules:
            await this.mcpReadService.listCategorizationRules(userId, {}),
        }),
    );

    server.registerResource(
      'latest_portfolio_holdings',
      new ResourceTemplate('splice://portfolio/holdings/latest', {
        list: undefined,
      }),
      {
        title: 'Latest Portfolio Holdings',
        description:
          'Latest investment holdings across owned investment accounts.',
        mimeType: 'application/json',
      },
      async (uri) =>
        jsonResource(
          uri,
          await this.mcpReadService.listInvestmentHoldings(userId, {}),
        ),
    );

    server.registerTool(
      'get_user_context',
      {
        title: 'Get User Context',
        description:
          'Get the authenticated Splice user timezone, preferred currency, and current date.',
        inputSchema: {},
        outputSchema: GetUserContextOutputSchema,
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async () => {
        const user = await this.userService.findOne(userId);
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
    );

    server.registerTool(
      'get_accounts_snapshot',
      {
        title: 'Get Accounts Snapshot',
        description:
          'Get current Splice accounts, institutions, account groupings, and balances for the authenticated user.',
        inputSchema: {},
        outputSchema: AccountsSnapshotOutputSchema,
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async () =>
        toolResult(
          await this.accountsSurfaceService.getAccountsSnapshot(userId),
        ),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.balanceHistorySurfaceService.getBalanceHistorySummary(
            userId,
            input,
          ),
        ),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.transactionsSurfaceService.searchTransactions(userId, {
            ...input,
            limit: Math.min(input.limit ?? 20, 20),
          }),
        ),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(await this.mcpReadService.listTransactions(userId, input)),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.mcpReadService.listBalanceSnapshots(userId, input),
        ),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(await this.mcpReadService.listCategories(userId, input)),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.mcpReadService.listInvestmentHoldings(userId, input),
        ),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.mcpReadService.listInvestmentActivity(userId, input),
        ),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.mcpReadService.listRecurringManualTransactionSchedules(
            userId,
            input,
          ),
        ),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(await this.mcpReadService.listAnalysisRules(userId, input)),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.mcpReadService.listCategorizationRules(userId, input),
        ),
    );

    server.registerTool(
      'list_categorization_rule_recommendations',
      {
        title: 'List Categorization Rule Recommendations',
        description:
          'List pending categorization rule recommendations and latest generation state. This read-only tool cannot generate, accept, or dismiss recommendations.',
        inputSchema: {},
        outputSchema: CategorizationRecommendationsOutputSchema,
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async () =>
        toolResult(
          await this.mcpReadService.listCategorizationRuleRecommendations(
            userId,
          ),
        ),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.mcpCategorizationService.listManualCategorizedTransactionExamples(
            userId,
            input,
          ),
        ),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.mcpCategorizationService.listRuleCandidatePatterns(
            userId,
            input,
          ),
        ),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.mcpCategorizationService.previewDraft(userId, input),
        ),
    );

    server.registerTool(
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
        annotations: ADDITIVE_WRITE_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.mcpCategorizationService.createRule(userId, input),
        ),
    );

    server.registerTool(
      'preview_categorization_rule_application',
      {
        title: 'Preview Categorization Rule Application',
        description:
          'Preview applying a saved categorization rule to existing transactions. Use the returned previewToken only for applying the same saved rule.',
        inputSchema: {
          ruleId: UuidSchema,
        },
        outputSchema: CategorizationRuleApplicationPreviewOutputSchema,
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.mcpCategorizationService.previewRuleApplication(
            userId,
            input.ruleId,
          ),
        ),
    );

    server.registerTool(
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
        annotations: DESTRUCTIVE_IDEMPOTENT_WRITE_ANNOTATIONS,
      },
      async (input) =>
        toolResult(
          await this.mcpCategorizationService.applyRule(userId, input),
        ),
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) => {
        assertDateRange(input.startDate, input.endDate);

        return toolResult(
          mcpCashflowAnalysis(
            await this.transactionAnalysisService.getAnalysis(
              input.startDate,
              input.endDate,
              userId,
            ),
          ),
        );
      },
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) => {
        assertDateRange(input.startDate, input.endDate);

        return toolResult({
          data: await this.transactionAnalysisService.getCategoryTransactions(
            input.startDate,
            input.endDate,
            input.categoryPrimary,
            input.flowDirection,
            userId,
          ),
          query: input,
        });
      },
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) => {
        assertDateRange(input.startDate, input.endDate);

        return toolResult(
          await this.transactionAnalysisService.getAnalysisAudit(
            input.startDate,
            input.endDate,
            userId,
          ),
        );
      },
    );

    server.registerTool(
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
        annotations: READ_ONLY_ANNOTATIONS,
        _meta: appToolMeta(APP_RESOURCES.cashflowExplorer),
      },
      async (input) => {
        assertDateRange(input.startDate, input.endDate);
        const analysis = mcpCashflowAnalysis(
          await this.transactionAnalysisService.getAnalysis(
            input.startDate,
            input.endDate,
            userId,
          ),
        );

        return appToolResult(
          APP_RESOURCES.cashflowExplorer,
          'Use the structured cash-flow analysis data to summarize income, outflows, categories, and rule-adjusted totals.',
          analysis,
        );
      },
    );

    server.registerTool(
      'show_projection_scenario_modeler',
      {
        title: 'Show Projection Scenario Modeler',
        description:
          'Return an MCP Apps UI for collecting non-persistent projection assumptions and reviewing current projection baselines.',
        inputSchema: {},
        outputSchema: AppToolOutputSchema,
        annotations: READ_ONLY_ANNOTATIONS,
        _meta: appToolMeta(APP_RESOURCES.projectionScenarioModeler),
      },
      async () =>
        appToolResult(
          APP_RESOURCES.projectionScenarioModeler,
          'Collect non-sensitive projection assumptions, then use get_accounts_snapshot, list_balance_snapshots, and list_recurring_manual_transaction_schedules for baselines.',
          {
            accounts:
              await this.accountsSurfaceService.getAccountsSnapshot(userId),
            recurringSchedules:
              await this.mcpReadService.listRecurringManualTransactionSchedules(
                userId,
                {},
              ),
          },
        ),
    );

    server.registerTool(
      'show_portfolio_viewer',
      {
        title: 'Show Portfolio Viewer',
        description:
          'Return an MCP Apps UI for latest holdings and investment activity, with structured fallback data.',
        inputSchema: {
          accountIds: z.array(UuidSchema).optional(),
        },
        outputSchema: AppToolOutputSchema,
        annotations: READ_ONLY_ANNOTATIONS,
        _meta: appToolMeta(APP_RESOURCES.portfolioViewer),
      },
      async (input) =>
        appToolResult(
          APP_RESOURCES.portfolioViewer,
          'Use holdings and investment activity fallback data to summarize portfolio positions and recent investment transactions.',
          {
            holdings: await this.mcpReadService.listInvestmentHoldings(userId, {
              accountIds: input.accountIds,
            }),
            activity: await this.mcpReadService.listInvestmentActivity(userId, {
              accountIds: input.accountIds,
              pageSize: 25,
            }),
          },
        ),
    );

    server.registerTool(
      'show_category_rule_workbench',
      {
        title: 'Show Category Rule Workbench',
        description:
          'Return an MCP Apps UI for read-only category, analysis rule, categorization rule, and recommendation context.',
        inputSchema: {},
        outputSchema: AppToolOutputSchema,
        annotations: READ_ONLY_ANNOTATIONS,
        _meta: appToolMeta(APP_RESOURCES.categoryRuleWorkbench),
      },
      async () =>
        appToolResult(
          APP_RESOURCES.categoryRuleWorkbench,
          'Use category and rule fallback data to explain category metadata, cash-flow rules, categorization automation, and pending recommendations.',
          {
            categories: await this.mcpReadService.listCategories(userId, {}),
            analysisRules: await this.mcpReadService.listAnalysisRules(
              userId,
              {},
            ),
            categorizationRules:
              await this.mcpReadService.listCategorizationRules(userId, {}),
            recommendations:
              await this.mcpReadService.listCategorizationRuleRecommendations(
                userId,
              ),
          },
        ),
    );

    server.registerTool(
      'collect_projection_assumptions',
      {
        title: 'Collect Projection Assumptions',
        description:
          'Collect non-sensitive, non-persistent projection assumptions through client elicitation when supported, or return an inputRequired fallback.',
        inputSchema: {
          suggestedHorizonDate: DateStringSchema.optional(),
          goalName: z.string().optional(),
        },
        outputSchema: ProjectionAssumptionsOutputSchema,
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async (input) => {
        const inputRequired = {
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
        };
        const capabilities = server.server.getClientCapabilities();

        if (!capabilities?.elicitation) {
          return toolResult({
            source: 'fallback',
            inputRequired,
          });
        }

        const result = await server.server.elicitInput({
          mode: 'form',
          message:
            'Provide non-sensitive projection assumptions for this in-session Splice scenario. These values will not be saved.',
          requestedSchema: {
            type: 'object',
            properties: {
              horizonDate: {
                type: 'string',
                title: 'Horizon date',
                description: 'Projection horizon date in YYYY-MM-DD.',
                format: 'date',
              },
              goalName: {
                type: 'string',
                title: 'Goal name',
                description: 'Optional scenario label.',
                default: input.goalName,
              },
              recurringIncomeAdjustment: {
                type: 'number',
                title: 'Recurring income adjustment',
                description: 'Monthly recurring income change in major units.',
                default: 0,
              },
              recurringExpenseAdjustment: {
                type: 'number',
                title: 'Recurring expense adjustment',
                description: 'Monthly recurring expense change in major units.',
                default: 0,
              },
              oneTimeEventsText: {
                type: 'string',
                title: 'One-time events',
                description:
                  'Optional plain-text event list with date, amount, currency, sign, and label.',
              },
              expectedAnnualReturnPercent: {
                type: 'number',
                title: 'Expected annual return percent',
                description: 'Optional expected annual return percentage.',
              },
            },
            required: ['horizonDate'],
          },
        });

        if (result.action !== 'accept') {
          return toolResult({
            source: 'fallback',
            inputRequired: {
              ...inputRequired,
              action: result.action,
            },
          });
        }

        const assumptions = result.content ?? {};
        if (
          typeof assumptions.horizonDate === 'string' &&
          !DateStringSchema.safeParse(assumptions.horizonDate).success
        ) {
          throw new BadRequestException(
            'Elicited horizonDate must be YYYY-MM-DD.',
          );
        }

        return toolResult({
          source: 'elicited',
          assumptions,
        });
      },
    );

    const workflowPromptArgs = {
      startDate: DateStringSchema.optional(),
      endDate: DateStringSchema.optional(),
      reportingCurrency: CurrencySchema.optional(),
      accountIds: z.array(UuidSchema).optional(),
      detailLevel: DetailLevelSchema.optional(),
    };

    server.registerPrompt(
      'monthly_cashflow_review',
      {
        title: 'Monthly Cashflow Review',
        description:
          'Review monthly cash-flow totals, category breakdowns, rules, and notable transactions.',
        argsSchema: workflowPromptArgs,
      },
      (input) => {
        if (input.startDate && input.endDate) {
          assertDateRange(input.startDate, input.endDate);
        }

        return promptText(`Run a Splice monthly cash-flow review for ${promptDateRange(input)}

Tool sequence:
1. Call get_user_context.
2. Call get_cashflow_analysis for the requested range.
3. Call get_cashflow_analysis_audit to explain rule and neutralization effects.
4. Use list_cashflow_category_transactions for important categories that need drilldown.
5. If custom patterns are requested, call list_transactions and page until pageInfo.hasMore is false.

State whether pending transactions are included, use structuredContent, and do not infer totals from partial pages.`);
      },
    );

    server.registerPrompt(
      'projection_builder',
      {
        title: 'Projection Builder',
        description:
          'Build a projection workflow from current accounts, historical balances, recurring schedules, and explicit user assumptions.',
        argsSchema: workflowPromptArgs,
      },
      (input) => {
        if (input.startDate && input.endDate) {
          assertDateRange(input.startDate, input.endDate);
        }

        return promptText(`Build a Splice projection workflow for ${promptDateRange(input)}

Tool sequence:
1. Call get_user_context.
2. Call get_accounts_snapshot for current account baselines.
3. Call list_balance_snapshots for historical baselines and page when needed.
4. Call list_recurring_manual_transaction_schedules for known recurring assumptions.
5. Call collect_projection_assumptions if the host supports elicitation, or ask the user for the returned inputRequired fields.
6. Use show_projection_scenario_modeler when MCP Apps are supported.

Do not invent future income, expense, return, allocation, or one-time-event assumptions.`);
      },
    );

    server.registerPrompt(
      'category_cleanup_audit',
      {
        title: 'Category Cleanup Audit',
        description:
          'Audit category metadata, uncategorized activity, categorization rules, and recommendations.',
        argsSchema: workflowPromptArgs,
      },
      (input) => {
        if (input.startDate && input.endDate) {
          assertDateRange(input.startDate, input.endDate);
        }

        return promptText(`Audit Splice category cleanup opportunities for ${promptDateRange(input)}

Tool sequence:
1. Call get_user_context.
2. Call list_categories with includeArchived when historical context is needed.
3. Call list_transactions with categoryId UNCATEGORIZED and page fully for uncategorized rows.
4. Call list_categorization_rules and list_categorization_rule_recommendations.
5. Use show_category_rule_workbench when MCP Apps are supported.

Provider category hints are guidance only; category filters are user-category filters.`);
      },
    );

    server.registerPrompt(
      'portfolio_snapshot',
      {
        title: 'Portfolio Snapshot',
        description:
          'Summarize latest holdings, date-specific positions, and recent investment activity.',
        argsSchema: workflowPromptArgs,
      },
      (input) => {
        if (input.startDate && input.endDate) {
          assertDateRange(input.startDate, input.endDate);
        }

        return promptText(`Create a Splice portfolio snapshot for ${promptDateRange(input)}

Tool sequence:
1. Call get_user_context.
2. Call list_investment_holdings for latest positions or date-specific positions when requested.
3. Call list_investment_activity for investment transactions and page until pageInfo.hasMore is false if the full period matters.
4. Call get_accounts_snapshot for account balance context.
5. Use show_portfolio_viewer when MCP Apps are supported.

Keep investment activity separate from banking/manual cash-flow analysis.`);
      },
    );

    server.registerPrompt(
      'tax_or_refund_anomaly_review',
      {
        title: 'Tax Or Refund Anomaly Review',
        description:
          'Review potential refund, transfer, or tax-related anomalies using cash-flow analysis and raw transaction reads.',
        argsSchema: workflowPromptArgs,
      },
      (input) => {
        if (input.startDate && input.endDate) {
          assertDateRange(input.startDate, input.endDate);
        }

        return promptText(`Review tax, refund, or transfer anomalies for ${promptDateRange(input)}

Tool sequence:
1. Call get_user_context.
2. Call get_cashflow_analysis and get_cashflow_analysis_audit for rule-adjusted context.
3. Call list_transactions with relevant date, amountSign, categoryId, categoryDetailed, merchantQuery, and amountFilter options.
4. Page list_transactions until pageInfo.hasMore is false for any claim about totals.
5. Use list_analysis_rules to explain configured exclusions or neutralizations.

Separate rule-adjusted analysis from raw transaction observations in the answer.`);
      },
    );

    return server;
  }
}
