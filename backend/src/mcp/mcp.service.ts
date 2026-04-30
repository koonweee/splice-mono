import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AccountsSurfaceService } from '../account/accounts-surface.service';
import { BalanceHistorySurfaceService } from '../balance-query/balance-history-surface.service';
import { TransactionsSurfaceService } from '../transaction/transactions-surface.service';
import { UserService } from '../user/user.service';
import { normalizeMcpMoney } from './mcp-money';
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
const CursorSchema = z
  .string()
  .optional()
  .describe('Opaque cursor returned by the previous pageInfo.nextCursor.');

const MCP_GUIDE = `# Splice MCP Guide

Use get_user_context first to get today, timezone, and the user's preferred currency.

For spending totals or patterns, call list_transactions for the full date range and keep paging until pageInfo.hasMore is false. Do not infer totals from a partial page unless you clearly say it is a sample.

For projections, use get_accounts_snapshot for current state and list_balance_snapshots for historical account-level baselines. Ask the user for future income, expense, return, allocation, or one-time-event assumptions; do not invent them.

Use reportingCurrency from get_user_context.currency unless the user asks for another currency. Compare amounts using convertedAmount. Native amount preserves the original transaction currency.

All MCP money amounts are major units and always include currency and sign. Amount filters require a currency and are applied after conversion into reportingCurrency.

Dates are inclusive YYYY-MM-DD. Resolve relative dates using get_user_context.today and timezone.

Pending transactions are excluded by default unless includePending is true. State whether pending transactions were included.`;

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
  ] as const;

  constructor(
    private readonly userService: UserService,
    private readonly accountsSurfaceService: AccountsSurfaceService,
    private readonly balanceHistorySurfaceService: BalanceHistorySurfaceService,
    private readonly transactionsSurfaceService: TransactionsSurfaceService,
    private readonly mcpReadService: McpReadService,
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
          'Legacy transaction search by date, account, merchant, category, sign, amount, and pending state. Returns at most 20 rows; use list_transactions for spending totals or patterns.',
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
          await this.transactionsSurfaceService.findForAsk(userId, {
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
          'List raw transactions for analysis with cursor pagination. For spending totals or patterns, keep paging until pageInfo.hasMore is false. All money amounts are major units. Always use convertedAmount for cross-currency comparisons.',
        inputSchema: {
          startDate: DateStringSchema.optional().describe(
            'Inclusive start date in YYYY-MM-DD. Resolve relative dates using get_user_context.today.',
          ),
          endDate: DateStringSchema.optional().describe(
            'Inclusive end date in YYYY-MM-DD. Resolve relative dates using get_user_context.today.',
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
          merchantQuery: z
            .string()
            .optional()
            .describe('Case-insensitive fuzzy merchant-name search.'),
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
          'List valid transaction category codes and friendly labels. Use this before category-filtered transaction queries instead of guessing category strings.',
        inputSchema: {
          startDate: DateStringSchema.optional().describe(
            'Optional inclusive start date for transaction counts.',
          ),
          endDate: DateStringSchema.optional().describe(
            'Optional inclusive end date for transaction counts.',
          ),
        },
      },
      async (input) =>
        toolResult(await this.mcpReadService.listCategories(userId, input)),
    );

    return server;
  }
}
