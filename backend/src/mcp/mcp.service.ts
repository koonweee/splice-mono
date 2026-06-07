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
import { getDecimalPlaces, MoneySign } from '../types/MoneyWithSign';
import type {
  CategoryAggregate,
  TransactionAnalysisResponse,
} from '../types/TransactionAnalysis';
import { UserService } from '../user/user.service';
import { normalizeMcpMoney, type McpMoney } from './mcp-money';
import { McpReadService } from './mcp-read.service';
import {
  AccountsSnapshotOutputSchema,
  AppToolOutputSchema,
  BalanceHistoryOutputSchema,
  CashflowAnalysisOutputSchema,
  CashflowAuditOutputSchema,
  CashflowCategoryTransactionsOutputSchema,
  CategoriesOutputSchema,
  CategorizationRecommendationsOutputSchema,
  GetUserContextOutputSchema,
  InvestmentHoldingsOutputSchema,
  PaginatedListOutputSchema,
  ProjectionAssumptionsOutputSchema,
  RecurringSchedulesOutputSchema,
  RuleListOutputSchema,
  SearchTransactionsOutputSchema,
} from './mcp-schemas';

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

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

const APP_RESOURCES = {
  cashflowExplorer: {
    id: 'cashflow_explorer',
    title: 'Cashflow Explorer',
    resourceUri: 'ui://splice/cashflow-explorer.html',
  },
  projectionScenarioModeler: {
    id: 'projection_scenario_modeler',
    title: 'Projection Scenario Modeler',
    resourceUri: 'ui://splice/projection-scenario-modeler.html',
  },
  portfolioViewer: {
    id: 'portfolio_viewer',
    title: 'Portfolio Viewer',
    resourceUri: 'ui://splice/portfolio-viewer.html',
  },
  categoryRuleWorkbench: {
    id: 'category_rule_workbench',
    title: 'Category Rule Workbench',
    resourceUri: 'ui://splice/category-rule-workbench.html',
  },
} as const;

const MCP_GUIDE = `# Splice MCP Guide

Use get_user_context first to get today, timezone, and the user's preferred currency.

For cash-flow totals and category breakdowns, call get_cashflow_analysis. The summary applies the user's analysis rules and neutralization lookaround setting.

For custom spending patterns not covered by get_cashflow_analysis, call list_transactions for the full date range and keep paging until pageInfo.hasMore is false. Do not infer totals from a partial page unless you clearly say it is a sample.

For projections, use get_accounts_snapshot for current state and list_balance_snapshots for historical account-level baselines. Ask the user for future income, expense, return, allocation, or one-time-event assumptions; do not invent them.

Every tool returns structuredContent and declares an outputSchema. Use structuredContent for validation and parsing; text content mirrors the same JSON for older clients. Tools are annotated read-only unless a future guide explicitly says otherwise.

Available prompts: monthly_cashflow_review, projection_builder, category_cleanup_audit, portfolio_snapshot, and tax_or_refund_anomaly_review. Prompts provide workflow guidance and still require clients to call the listed tools.

Prefer resource templates for reusable report reads when a client asks for a durable report URI: splice://reports/cashflow/{startDate}/{endDate}, splice://accounts/{accountId}/snapshot, splice://categories/taxonomy, splice://rules/analysis, and splice://portfolio/holdings/latest.

MCP Apps are progressive enhancement. Use app-backed show_* tools when the host supports MCP Apps; otherwise use each tool's fallback structuredContent and continue with text.

Projection assumption elicitation is optional and non-persistent. If the client does not support elicitation, collect_projection_assumptions returns an inputRequired object the client can ask the user about normally.

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

function htmlResource(uri: URL, title: string, body: string) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: MCP_APP_MIME_TYPE,
        text: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f8fafc; color: #111827; }
    main { min-height: 100vh; padding: 20px; box-sizing: border-box; display: grid; gap: 16px; align-content: start; }
    h1 { margin: 0; font-size: 20px; line-height: 1.2; }
    p { margin: 0; color: #4b5563; line-height: 1.5; }
    .panel { background: white; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; display: grid; gap: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .tile { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; background: #ffffff; min-height: 72px; }
    .label { font-size: 12px; text-transform: uppercase; color: #6b7280; letter-spacing: 0; }
    .value { margin-top: 6px; font-size: 18px; font-weight: 650; }
    .bars { display: grid; gap: 10px; }
    .bar { display: grid; grid-template-columns: 92px 1fr; gap: 10px; align-items: center; font-size: 13px; color: #374151; }
    .track { height: 12px; border-radius: 999px; background: #e5e7eb; overflow: hidden; }
    .fill { height: 100%; background: #2563eb; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
    th { color: #4b5563; font-weight: 650; }
    form { display: grid; gap: 10px; }
    label { display: grid; gap: 4px; font-size: 13px; color: #374151; }
    input { min-height: 34px; border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px; font: inherit; }
    @media (max-width: 520px) { main { padding: 14px; } h1 { font-size: 18px; } }
  </style>
</head>
<body>
  <main data-splice-mcp-app="${title}">
    ${body}
  </main>
</body>
</html>`,
      },
    ],
  };
}

function appToolResult(
  app: (typeof APP_RESOURCES)[keyof typeof APP_RESOURCES],
  fallback: string,
  data?: unknown,
): CallToolResult {
  return toolResult({
    app,
    data,
    fallback,
  });
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

    server.registerResource(
      'splice_cashflow_explorer_app',
      APP_RESOURCES.cashflowExplorer.resourceUri,
      {
        title: APP_RESOURCES.cashflowExplorer.title,
        description: 'Interactive cash-flow chart and category drilldown UI.',
        mimeType: MCP_APP_MIME_TYPE,
      },
      (uri) =>
        htmlResource(
          uri,
          APP_RESOURCES.cashflowExplorer.title,
          `<section class="panel">
    <h1>Cashflow Explorer</h1>
    <p>Review rule-adjusted income, outflows, category totals, and transaction drilldowns from Splice MCP tools.</p>
  </section>
  <section class="grid" aria-label="Cashflow summary placeholders">
    <div class="tile"><div class="label">Totals</div><div class="value">Tool driven</div></div>
    <div class="tile"><div class="label">Categories</div><div class="value">Drilldown</div></div>
    <div class="tile"><div class="label">Rules</div><div class="value">Auditable</div></div>
  </section>
  <section class="panel" aria-label="Cashflow category chart">
    <div class="bars">
      <div class="bar"><span>Income</span><div class="track"><div class="fill" style="width: 82%"></div></div></div>
      <div class="bar"><span>Housing</span><div class="track"><div class="fill" style="width: 58%"></div></div></div>
      <div class="bar"><span>Food</span><div class="track"><div class="fill" style="width: 34%"></div></div></div>
    </div>
  </section>`,
        ),
    );

    server.registerResource(
      'splice_projection_scenario_modeler_app',
      APP_RESOURCES.projectionScenarioModeler.resourceUri,
      {
        title: APP_RESOURCES.projectionScenarioModeler.title,
        description:
          'Interactive projection assumption UI for non-persistent scenarios.',
        mimeType: MCP_APP_MIME_TYPE,
      },
      (uri) =>
        htmlResource(
          uri,
          APP_RESOURCES.projectionScenarioModeler.title,
          `<section class="panel">
    <h1>Projection Scenario Modeler</h1>
    <p>Collect horizon, recurring cash-flow changes, one-time events, and expected return assumptions without persisting them.</p>
  </section>
  <section class="grid" aria-label="Projection inputs">
    <div class="tile"><div class="label">Horizon</div><div class="value">Date</div></div>
    <div class="tile"><div class="label">Recurring</div><div class="value">Income/Expense</div></div>
    <div class="tile"><div class="label">Events</div><div class="value">Scenario only</div></div>
  </section>
  <section class="panel" aria-label="Projection assumption form">
    <form>
      <label>Horizon date<input value="2027-12-31" readonly></label>
      <label>Monthly income change<input value="0.00" readonly></label>
      <label>Expected annual return<input value="5%" readonly></label>
    </form>
  </section>`,
        ),
    );

    server.registerResource(
      'splice_portfolio_viewer_app',
      APP_RESOURCES.portfolioViewer.resourceUri,
      {
        title: APP_RESOURCES.portfolioViewer.title,
        description: 'Interactive portfolio holdings and activity UI.',
        mimeType: MCP_APP_MIME_TYPE,
      },
      (uri) =>
        htmlResource(
          uri,
          APP_RESOURCES.portfolioViewer.title,
          `<section class="panel">
    <h1>Portfolio Viewer</h1>
    <p>Inspect latest holdings, date-specific positions, and investment activity from Splice MCP investment tools.</p>
  </section>
  <section class="grid" aria-label="Portfolio panels">
    <div class="tile"><div class="label">Holdings</div><div class="value">Latest</div></div>
    <div class="tile"><div class="label">Activity</div><div class="value">Paged</div></div>
    <div class="tile"><div class="label">Securities</div><div class="value">Context</div></div>
  </section>
  <section class="panel" aria-label="Portfolio holdings table">
    <table>
      <thead><tr><th>Security</th><th>Quantity</th><th>Value</th></tr></thead>
      <tbody><tr><td>Example Fund</td><td>Tool data</td><td>Structured fallback</td></tr></tbody>
    </table>
  </section>`,
        ),
    );

    server.registerResource(
      'splice_category_rule_workbench_app',
      APP_RESOURCES.categoryRuleWorkbench.resourceUri,
      {
        title: APP_RESOURCES.categoryRuleWorkbench.title,
        description:
          'Interactive category, analysis rule, and categorization recommendation UI.',
        mimeType: MCP_APP_MIME_TYPE,
      },
      (uri) =>
        htmlResource(
          uri,
          APP_RESOURCES.categoryRuleWorkbench.title,
          `<section class="panel">
    <h1>Category Rule Workbench</h1>
    <p>Compare categories, cash-flow analysis rules, categorization automation, and pending rule recommendations in read-only mode.</p>
  </section>
  <section class="grid" aria-label="Rule workbench panels">
    <div class="tile"><div class="label">Categories</div><div class="value">Metadata</div></div>
    <div class="tile"><div class="label">Analysis</div><div class="value">Rules</div></div>
    <div class="tile"><div class="label">Automation</div><div class="value">Suggestions</div></div>
  </section>
  <section class="panel" aria-label="Category rules table">
    <table>
      <thead><tr><th>Surface</th><th>Context</th><th>Mode</th></tr></thead>
      <tbody><tr><td>Categories</td><td>IDs, colors, archived state</td><td>Read-only</td></tr><tr><td>Rules</td><td>Analysis and categorization</td><td>Read-only</td></tr></tbody>
    </table>
  </section>`,
        ),
    );

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
        _meta: {
          ui: { resourceUri: APP_RESOURCES.cashflowExplorer.resourceUri },
          'openai/outputTemplate': APP_RESOURCES.cashflowExplorer.resourceUri,
        },
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
        _meta: {
          ui: {
            resourceUri: APP_RESOURCES.projectionScenarioModeler.resourceUri,
          },
          'openai/outputTemplate':
            APP_RESOURCES.projectionScenarioModeler.resourceUri,
        },
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
        _meta: {
          ui: { resourceUri: APP_RESOURCES.portfolioViewer.resourceUri },
          'openai/outputTemplate': APP_RESOURCES.portfolioViewer.resourceUri,
        },
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
        _meta: {
          ui: {
            resourceUri: APP_RESOURCES.categoryRuleWorkbench.resourceUri,
          },
          'openai/outputTemplate':
            APP_RESOURCES.categoryRuleWorkbench.resourceUri,
        },
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
