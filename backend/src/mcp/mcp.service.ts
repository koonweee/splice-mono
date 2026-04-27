import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AccountsSurfaceService } from '../account/accounts-surface.service';
import { BalanceHistorySurfaceService } from '../balance-query/balance-history-surface.service';
import { TransactionsSurfaceService } from '../transaction/transactions-surface.service';
import { UserService } from '../user/user.service';
import { normalizeMcpMoney } from './mcp-money';

const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

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
  ] as const;

  constructor(
    private readonly userService: UserService,
    private readonly accountsSurfaceService: AccountsSurfaceService,
    private readonly balanceHistorySurfaceService: BalanceHistorySurfaceService,
    private readonly transactionsSurfaceService: TransactionsSurfaceService,
  ) {}

  getToolNames(): readonly string[] {
    return SpliceMcpService.TOOL_NAMES;
  }

  createServer(userId: string): McpServer {
    const server = new McpServer({
      name: 'splice',
      version: '1.0.0',
    });

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
          'Search Splice transactions by date, account, merchant, category, sign, amount, and pending state. Returns at most 20 rows.',
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

    return server;
  }
}
