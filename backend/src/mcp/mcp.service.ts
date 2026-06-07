import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
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
import { getDecimalPlaces, MoneySign } from '../types/MoneyWithSign';
import type {
  CategoryAggregate,
  TransactionAnalysisResponse,
} from '../types/TransactionAnalysis';
import { UserService } from '../user/user.service';
import { normalizeMcpMoney, type McpMoney } from './mcp-money';
import { McpReadService } from './mcp-read.service';

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

const MCP_GUIDE = `# Splice MCP Guide

Use get_user_context first to get today, timezone, and the user's preferred currency.

For cash-flow totals and category breakdowns, call get_cashflow_analysis. The summary applies the user's analysis rules and neutralization lookaround setting.

For custom spending patterns not covered by get_cashflow_analysis, call list_transactions for the full date range and keep paging until pageInfo.hasMore is false. Do not infer totals from a partial page unless you clearly say it is a sample.

For projections, use get_accounts_snapshot for current state and list_balance_snapshots for historical account-level baselines. Ask the user for future income, expense, return, allocation, or one-time-event assumptions; do not invent them.

Use list_investment_holdings for current or date-specific investment positions. Use list_investment_activity for investment transactions. Investment activity is separate from banking/manual transactions and is not included in get_cashflow_analysis.

Use list_recurring_manual_transaction_schedules as user-known projection assumptions before asking the user to restate recurring income or expenses. Schedules are projection inputs, not generated future transactions.

Use list_analysis_rules to explain configured cash-flow rules, then get_cashflow_analysis_audit for date-range-specific rule effects. Use list_categorization_rules and list_categorization_rule_recommendations to explain category automation context; these MCP tools are read-only and cannot create, apply, accept, or dismiss rules.

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
    'get_cashflow_analysis',
    'list_cashflow_category_transactions',
    'get_cashflow_analysis_audit',
  ] as const;

  constructor(
    private readonly userService: UserService,
    private readonly accountsSurfaceService: AccountsSurfaceService,
    private readonly balanceHistorySurfaceService: BalanceHistorySurfaceService,
    private readonly transactionsSurfaceService: TransactionsSurfaceService,
    private readonly mcpReadService: McpReadService,
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

    server.registerTool(
      'get_user_context',
      {
        title: 'Get User Context',
        description:
          'Get the authenticated Splice user timezone, preferred currency, and current date.',
        inputSchema: {},
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
      },
      async () =>
        toolResult(
          await this.mcpReadService.listCategorizationRuleRecommendations(
            userId,
          ),
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

    return server;
  }
}
