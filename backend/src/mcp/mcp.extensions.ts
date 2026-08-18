import {
  enforceRequiredScopes,
  mcpExtensionErrorBoundary,
  McpPublicError,
  type McpRequestContext,
} from '@koonweee/mcp-kit';
import {
  McpServer,
  ResourceTemplate,
  type ReadResourceResult,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { getDecimalPlaces, MoneySign } from '../types/MoneyWithSign';
import type {
  CategoryAggregate,
  TransactionAnalysisAuditResponse,
  TransactionAnalysisResponse,
} from '../types/TransactionAnalysis';
import { normalizeMcpMoney, type McpMoney } from './mcp-money';
import type { CashFlowAdjustmentSummary } from './mcp-schemas';
import type { SpliceMcpDependencies } from './mcp.definition';

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
export const CurrencySchema = z
  .string()
  .trim()
  .min(3)
  .max(10)
  .describe('Currency code for major-unit money amounts, e.g. USD or SGD.');
export const UuidSchema = z.string().uuid();
const DetailLevelSchema = z.enum(['summary', 'standard', 'detailed']);

export const MCP_GUIDE = `# Splice MCP Guide

Use get_user_context first to get today, timezone, and the user's preferred currency.

For cash-flow totals and category breakdowns, call get_cashflow_analysis. The summary applies the user's analysis rules and neutralization lookaround setting.

For custom spending patterns not covered by get_cashflow_analysis, call list_transactions for the full date range and keep paging until pageInfo.hasMore is false. Do not infer totals from a partial page unless you clearly say it is a sample.

For projections, use get_accounts_snapshot for current state and list_balance_snapshots for historical account-level baselines. Ask the user for future income, expense, return, allocation, or one-time-event assumptions; do not invent them.

Every tool returns structuredContent and declares an outputSchema. Use structuredContent for validation and parsing; text content mirrors the same JSON for older clients. Inspect tool annotations before calling mutation tools.

Available prompts: monthly_cashflow_review, projection_builder, category_cleanup_audit, portfolio_snapshot, and tax_or_refund_anomaly_review. Prompts provide workflow guidance and still require clients to call the listed tools.

Prefer resource templates for reusable report reads when a client asks for a durable report URI: splice://reports/cashflow/{startDate}/{endDate}, splice://accounts/{accountId}/snapshot, splice://categories/taxonomy, splice://rules/analysis, and splice://portfolio/holdings/latest.

MCP Apps are progressive enhancement. Use visualize_cash_flow selectively when an actual spending, income, cash-flow, or comparison question benefits from concise visual evidence; do not use it for capability discovery, metadata, hypotheticals, or simple facts that prose communicates clearly. Use visualize_portfolio selectively for current portfolio value, ownership, allocation, exposure, or concentration questions that benefit from visual evidence; do not use it for investment activity, performance, capability discovery, hypotheticals, or simple holding facts. Both Apps are read-only and receive their scope from the conversation. Every App-backed tool preserves complete fallback structuredContent for hosts without App support.

Projection assumption input is optional and non-persistent. collect_projection_assumptions uses the official input-required/resume flow. Clients that decline or cancel receive a structured fallback describing the fields they can ask about normally.

Use list_investment_holdings for current or date-specific investment positions. Use list_investment_activity for investment transactions. Investment activity is separate from banking/manual transactions and is not included in get_cashflow_analysis.

Use list_recurring_manual_transaction_schedules as user-known projection assumptions before asking the user to restate recurring income or expenses. Schedules are projection inputs, not generated future transactions.

Use list_analysis_rules to explain configured cash-flow rules, then get_cashflow_analysis_audit for date-range-specific rule effects. Use list_categorization_rules and list_categorization_rule_recommendations to explain category automation context. OAuth access uses splice:read for reads and splice:write for both real categorization writes. Tool annotations are client presentation hints and do not guarantee confirmation. Trusted clients can inspect manual examples and candidate patterns, preview a proposed categorization rule draft, create the user-approved rule with the matching preview token, preview a saved rule application, and apply it with the matching preview token. Treat Splice preview counts and preview-token validation as authoritative; do not rely on client-estimated impact or a confirmation prompt. Rule application never overwrites manual transactions or manual category assignments.

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

export function mcpCashflowAnalysis(analysis: TransactionAnalysisResponse) {
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

export function mcpCashFlowAdjustmentSummary(
  audit: TransactionAnalysisAuditResponse,
): CashFlowAdjustmentSummary {
  let excludedTransactionCount = 0;
  let neutralizedPairCount = 0;

  for (const row of audit.rows) {
    if (row.type === 'excluded') excludedTransactionCount += 1;
    else if (row.type === 'neutralized') neutralizedPairCount += 1;
  }

  return {
    affected: excludedTransactionCount > 0 || neutralizedPairCount > 0,
    excludedTransactionCount,
    neutralizedPairCount,
  };
}

export function assertDateRange(startDate: string, endDate: string): void {
  if (startDate > endDate) {
    throw new McpPublicError(
      'invalid_date_range',
      'startDate must be before or equal to endDate',
    );
  }
}

function jsonResource(uri: URL, data: unknown): ReadResourceResult {
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

function requireReadScope(
  context: McpRequestContext<SpliceMcpDependencies>,
): void {
  enforceRequiredScopes(context.principal, ['splice:read']);
}

export function registerSpliceMcpExtensions(
  server: McpServer,
  context: McpRequestContext<SpliceMcpDependencies>,
): void {
  const { dependencies } = context;

  server.registerResource(
    'splice_mcp_guide',
    'splice://mcp-guide',
    {
      title: 'Splice MCP Guide',
      description:
        'Guidance for using Splice MCP tools safely for spending analysis and projections.',
      mimeType: 'text/markdown',
    },
    mcpExtensionErrorBoundary.resource((uri) => {
      requireReadScope(context);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: MCP_GUIDE,
          },
        ],
      };
    }),
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
    mcpExtensionErrorBoundary.resourceTemplate(async (uri, variables) => {
      requireReadScope(context);
      const startDate = String(variables.startDate);
      const endDate = String(variables.endDate);
      DateStringSchema.parse(startDate);
      DateStringSchema.parse(endDate);
      assertDateRange(startDate, endDate);

      return jsonResource(
        uri,
        mcpCashflowAnalysis(
          await dependencies.transactionAnalysisService.getAnalysis(
            startDate,
            endDate,
            dependencies.userId,
          ),
        ),
      );
    }),
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
    mcpExtensionErrorBoundary.resourceTemplate(async (uri, variables) => {
      requireReadScope(context);
      const accountId = UuidSchema.parse(String(variables.accountId));
      const snapshot =
        await dependencies.accountsSurfaceService.getAccountsSnapshot(
          dependencies.userId,
        );
      const accounts = Array.isArray(snapshot.accounts)
        ? snapshot.accounts
        : [];
      const account = accounts.find(
        (candidate: { id?: string }) => candidate.id === accountId,
      );
      if (!account) {
        throw new McpPublicError('not_found', 'Account not found');
      }

      return jsonResource(uri, { account });
    }),
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
    mcpExtensionErrorBoundary.resourceTemplate(async (uri) => {
      requireReadScope(context);

      return jsonResource(
        uri,
        await dependencies.mcpReadService.listCategories(
          dependencies.userId,
          {},
        ),
      );
    }),
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
    mcpExtensionErrorBoundary.resourceTemplate(async (uri) => {
      requireReadScope(context);

      return jsonResource(uri, {
        analysisRules: await dependencies.mcpReadService.listAnalysisRules(
          dependencies.userId,
          {},
        ),
        categorizationRules:
          await dependencies.mcpReadService.listCategorizationRules(
            dependencies.userId,
            {},
          ),
      });
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
    mcpExtensionErrorBoundary.resourceTemplate(async (uri) => {
      requireReadScope(context);

      return jsonResource(
        uri,
        await dependencies.mcpReadService.listInvestmentHoldings(
          dependencies.userId,
          {},
        ),
      );
    }),
  );

  const workflowPromptArgs = z.object({
    startDate: DateStringSchema.optional(),
    endDate: DateStringSchema.optional(),
    reportingCurrency: CurrencySchema.optional(),
    accountIds: z.array(UuidSchema).optional(),
    detailLevel: DetailLevelSchema.optional(),
  });

  server.registerPrompt(
    'monthly_cashflow_review',
    {
      title: 'Monthly Cashflow Review',
      description:
        'Review monthly cash-flow totals, category breakdowns, rules, and notable transactions.',
      argsSchema: workflowPromptArgs,
    },
    mcpExtensionErrorBoundary.prompt(workflowPromptArgs, (input) => {
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
    }),
  );

  server.registerPrompt(
    'projection_builder',
    {
      title: 'Projection Builder',
      description:
        'Build a projection workflow from current accounts, historical balances, recurring schedules, and explicit user assumptions.',
      argsSchema: workflowPromptArgs,
    },
    mcpExtensionErrorBoundary.prompt(workflowPromptArgs, (input) => {
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

  Do not invent future income, expense, return, allocation, or one-time-event assumptions.`);
    }),
  );

  server.registerPrompt(
    'category_cleanup_audit',
    {
      title: 'Category Cleanup Audit',
      description:
        'Audit category metadata, uncategorized activity, categorization rules, and recommendations.',
      argsSchema: workflowPromptArgs,
    },
    mcpExtensionErrorBoundary.prompt(workflowPromptArgs, (input) => {
      if (input.startDate && input.endDate) {
        assertDateRange(input.startDate, input.endDate);
      }

      return promptText(`Audit Splice category cleanup opportunities for ${promptDateRange(input)}

  Tool sequence:
  1. Call get_user_context.
  2. Call list_categories with includeArchived when historical context is needed.
  3. Call list_transactions with categoryId UNCATEGORIZED and page fully for uncategorized rows.
  4. Call list_categorization_rules and list_categorization_rule_recommendations.

  Provider category hints are guidance only; category filters are user-category filters.`);
    }),
  );

  server.registerPrompt(
    'portfolio_snapshot',
    {
      title: 'Portfolio Snapshot',
      description:
        'Summarize current portfolio ownership and concentration, with investment activity kept separate.',
      argsSchema: workflowPromptArgs,
    },
    mcpExtensionErrorBoundary.prompt(workflowPromptArgs, (input) => {
      if (input.startDate && input.endDate) {
        assertDateRange(input.startDate, input.endDate);
      }

      return promptText(`Create a Splice portfolio snapshot for ${promptDateRange(input)}

  Tool sequence:
  1. Call get_user_context.
  2. Call list_investment_holdings for latest positions or date-specific positions when requested.
  3. Call list_investment_activity for investment transactions and page until pageInfo.hasMore is false if the full period matters.
  4. Call get_accounts_snapshot for account balance context.
  5. Use visualize_portfolio for current ownership or concentration when MCP Apps are supported; pass an account subset only when the conversation requests one.

  Keep investment activity separate from banking/manual cash-flow analysis.`);
    }),
  );

  server.registerPrompt(
    'tax_or_refund_anomaly_review',
    {
      title: 'Tax Or Refund Anomaly Review',
      description:
        'Review potential refund, transfer, or tax-related anomalies using cash-flow analysis and raw transaction reads.',
      argsSchema: workflowPromptArgs,
    },
    mcpExtensionErrorBoundary.prompt(workflowPromptArgs, (input) => {
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
    }),
  );
}
