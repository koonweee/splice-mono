import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SpliceMcpService } from '../../src/mcp/mcp.service';
import { MoneySign } from '../../src/types/MoneyWithSign';

const mockUserId = '00000000-0000-0000-0000-000000000001';
const mockAccountId = '11111111-1111-4111-8111-111111111111';

describe('SpliceMcpService', () => {
  const userService = {
    findOne: jest.fn(),
  };
  const accountsSurfaceService = {
    getAccountsSnapshot: jest.fn(),
  };
  const balanceHistorySurfaceService = {
    getBalanceHistorySummary: jest.fn(),
  };
  const transactionsSurfaceService = {
    searchTransactions: jest.fn(),
  };
  const mcpReadService = {
    listTransactions: jest.fn(),
    listBalanceSnapshots: jest.fn(),
    listCategories: jest.fn(),
  };
  const transactionAnalysisService = {
    getAnalysis: jest.fn(),
    getCategoryTransactions: jest.fn(),
    getAnalysisAudit: jest.fn(),
    getBalanceAdjustments: jest.fn(),
  };

  let service: SpliceMcpService;

  beforeEach(() => {
    service = new SpliceMcpService(
      userService as never,
      accountsSurfaceService as never,
      balanceHistorySurfaceService as never,
      transactionsSurfaceService as never,
      mcpReadService as never,
      transactionAnalysisService as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function connect(server: McpServer) {
    const client = new Client({
      name: 'splice-mcp-test-client',
      version: '1.0.0',
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    return {
      client,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  }

  it('registers read-only MCP tools including cashflow analysis', async () => {
    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      const result = await client.listTools();

      expect(result.tools.map((tool) => tool.name).sort()).toEqual([
        'get_accounts_snapshot',
        'get_balance_history',
        'get_cashflow_analysis',
        'get_cashflow_analysis_audit',
        'get_user_context',
        'list_balance_snapshots',
        'list_cashflow_balance_adjustments',
        'list_cashflow_category_transactions',
        'list_categories',
        'list_transactions',
        'search_transactions',
      ]);
    } finally {
      await close();
    }
  });

  it('exposes calling-LLM guidance as a resource', async () => {
    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      const resources = await client.listResources();

      expect(resources.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: 'splice://mcp-guide',
            name: 'splice_mcp_guide',
          }),
        ]),
      );

      const guide = await client.readResource({ uri: 'splice://mcp-guide' });
      expect(guide.contents[0]).toMatchObject({
        mimeType: 'text/markdown',
      });
      expect(
        'text' in guide.contents[0] ? guide.contents[0].text : '',
      ).toContain('call get_cashflow_analysis');
    } finally {
      await close();
    }
  });

  it('returns user context for the authenticated user', async () => {
    userService.findOne.mockResolvedValue({
      id: mockUserId,
      email: 'user@example.com',
      settings: {
        currency: 'SGD',
        timezone: 'Asia/Singapore',
      },
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      const result = (await client.callTool({
        name: 'get_user_context',
        arguments: {},
      })) as CallToolResult;

      expect(result.structuredContent).toMatchObject({
        userId: mockUserId,
        email: 'user@example.com',
        currency: 'SGD',
        timezone: 'Asia/Singapore',
      });
      expect(result.structuredContent?.today).toEqual(expect.any(String));
    } finally {
      await close();
    }
  });

  it('normalizes account snapshot money for MCP output', async () => {
    accountsSurfaceService.getAccountsSnapshot.mockResolvedValue({
      matchedCount: 1,
      truncated: false,
      accounts: [
        {
          id: mockAccountId,
          displayName: 'Checking',
          institutionName: 'Splice Bank',
          grouping: 'cash',
          groupingLabel: 'Cash',
          balance: {
            money: { amount: 12345, currency: 'USD' },
            sign: MoneySign.POSITIVE,
          },
        },
      ],
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      const result = (await client.callTool({
        name: 'get_accounts_snapshot',
        arguments: {},
      })) as CallToolResult;

      expect(accountsSurfaceService.getAccountsSnapshot).toHaveBeenCalledWith(
        mockUserId,
      );
      expect(result.structuredContent).toMatchObject({
        accounts: [
          {
            balance: {
              amount: 123.45,
              currency: 'USD',
              sign: MoneySign.POSITIVE,
            },
          },
        ],
      });
    } finally {
      await close();
    }
  });

  it('delegates balance history requests to the balance history surface', async () => {
    balanceHistorySurfaceService.getBalanceHistorySummary.mockResolvedValue({
      netWorth: {
        money: { amount: 100000, currency: 'USD' },
        sign: MoneySign.POSITIVE,
      },
      chartData: [],
      assets: [],
      liabilities: [],
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      await client.callTool({
        name: 'get_balance_history',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          accountIds: [mockAccountId],
        },
      });

      expect(
        balanceHistorySurfaceService.getBalanceHistorySummary,
      ).toHaveBeenCalledWith(mockUserId, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        accountIds: [mockAccountId],
      });
    } finally {
      await close();
    }
  });

  it('searches transactions with a default limit of 20', async () => {
    transactionsSurfaceService.searchTransactions.mockResolvedValue({
      matchedCount: 0,
      truncated: false,
      transactions: [],
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      await client.callTool({
        name: 'search_transactions',
        arguments: {
          merchantQuery: 'coffee',
        },
      });

      expect(
        transactionsSurfaceService.searchTransactions,
      ).toHaveBeenCalledWith(mockUserId, {
        merchantQuery: 'coffee',
        limit: 20,
      });
    } finally {
      await close();
    }
  });

  it('delegates list_transactions to the MCP read service', async () => {
    mcpReadService.listTransactions.mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasMore: false },
      conversion: { reportingCurrency: 'USD', rates: [] },
      query: {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        includePending: false,
        reportingCurrency: 'USD',
      },
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      await client.callTool({
        name: 'list_transactions',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          merchantQuery: 'coffee',
          reportingCurrency: 'USD',
          pageSize: 50,
        },
      });

      expect(mcpReadService.listTransactions).toHaveBeenCalledWith(mockUserId, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        merchantQuery: 'coffee',
        reportingCurrency: 'USD',
        pageSize: 50,
      });
    } finally {
      await close();
    }
  });

  it('delegates list_balance_snapshots to the MCP read service', async () => {
    mcpReadService.listBalanceSnapshots.mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasMore: false },
      query: {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      },
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      await client.callTool({
        name: 'list_balance_snapshots',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          pageSize: 100,
        },
      });

      expect(mcpReadService.listBalanceSnapshots).toHaveBeenCalledWith(
        mockUserId,
        {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          pageSize: 100,
        },
      );
    } finally {
      await close();
    }
  });

  it('delegates list_categories to the MCP read service', async () => {
    mcpReadService.listCategories.mockResolvedValue({
      data: [],
      query: {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      },
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      await client.callTool({
        name: 'list_categories',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
        },
      });

      expect(mcpReadService.listCategories).toHaveBeenCalledWith(mockUserId, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });
    } finally {
      await close();
    }
  });

  it('returns cashflow analysis with MCP major-unit money', async () => {
    transactionAnalysisService.getAnalysis.mockResolvedValue({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      currency: 'USD',
      inflows: [
        {
          primaryCategory: 'INCOME',
          totalAmount: 250000,
          currency: 'USD',
          transactionCount: 2,
          color: '#2f9e44',
        },
      ],
      outflows: [
        {
          primaryCategory: 'FOOD_AND_DRINK',
          totalAmount: 4200,
          currency: 'USD',
          transactionCount: 3,
          color: '#f59f00',
        },
      ],
      totalInflow: 250000,
      totalOutflow: 4200,
      netFlow: 245800,
      uncategorizedInflow: 0,
      uncategorizedOutflow: 1200,
      balanceAdjustments: [
        {
          accountId: mockAccountId,
          accountName: 'Checking',
          flowDirection: 'outflow',
          currency: 'USD',
          deltaAmount: 5000,
          startBalance: { amount: 100000, currency: 'USD' },
          endBalance: { amount: 95000, currency: 'USD' },
        },
      ],
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      const result = (await client.callTool({
        name: 'get_cashflow_analysis',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
        },
      })) as CallToolResult;

      expect(transactionAnalysisService.getAnalysis).toHaveBeenCalledWith(
        '2026-03-01',
        '2026-03-31',
        mockUserId,
      );
      expect(result.structuredContent).toMatchObject({
        summaryIncludesBalanceAdjustments: true,
        totals: {
          totalInflow: {
            amount: 2500,
            currency: 'USD',
            sign: MoneySign.POSITIVE,
          },
          totalOutflow: {
            amount: 42,
            currency: 'USD',
            sign: MoneySign.NEGATIVE,
          },
          netFlow: {
            amount: 2458,
            currency: 'USD',
            sign: MoneySign.POSITIVE,
          },
          uncategorizedOutflow: {
            amount: 12,
            currency: 'USD',
            sign: MoneySign.NEGATIVE,
          },
        },
        inflows: [
          {
            primaryCategory: 'INCOME',
            totalAmount: {
              amount: 2500,
              currency: 'USD',
              sign: MoneySign.POSITIVE,
            },
          },
        ],
        outflows: [
          {
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: {
              amount: 42,
              currency: 'USD',
              sign: MoneySign.NEGATIVE,
            },
          },
        ],
        balanceAdjustments: [
          {
            accountId: mockAccountId,
            deltaAmount: {
              amount: 50,
              currency: 'USD',
              sign: MoneySign.NEGATIVE,
            },
            startBalance: {
              amount: 1000,
              currency: 'USD',
              sign: MoneySign.POSITIVE,
            },
            endBalance: {
              amount: 950,
              currency: 'USD',
              sign: MoneySign.POSITIVE,
            },
          },
        ],
      });
    } finally {
      await close();
    }
  });

  it('delegates cashflow category transaction drilldowns to the analysis service', async () => {
    transactionAnalysisService.getCategoryTransactions.mockResolvedValue([]);

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      await client.callTool({
        name: 'list_cashflow_category_transactions',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          categoryPrimary: 'FOOD_AND_DRINK',
          flowDirection: 'outflow',
        },
      });

      expect(
        transactionAnalysisService.getCategoryTransactions,
      ).toHaveBeenCalledWith(
        '2026-03-01',
        '2026-03-31',
        'FOOD_AND_DRINK',
        'outflow',
        mockUserId,
      );
    } finally {
      await close();
    }
  });

  it('delegates cashflow audit requests to the analysis service', async () => {
    transactionAnalysisService.getAnalysisAudit.mockResolvedValue({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      neutralizationLookaroundDays: 3,
      rows: [],
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      await client.callTool({
        name: 'get_cashflow_analysis_audit',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
        },
      });

      expect(transactionAnalysisService.getAnalysisAudit).toHaveBeenCalledWith(
        '2026-03-01',
        '2026-03-31',
        mockUserId,
      );
    } finally {
      await close();
    }
  });

  it('delegates balance adjustment drilldowns and converts money for MCP', async () => {
    transactionAnalysisService.getBalanceAdjustments.mockResolvedValue([
      {
        accountId: mockAccountId,
        accountName: 'Checking',
        flowDirection: 'inflow',
        currency: 'USD',
        deltaAmount: 7500,
        startBalance: { amount: 10000, currency: 'USD' },
        endBalance: { amount: 17500, currency: 'USD' },
      },
    ]);

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      const result = (await client.callTool({
        name: 'list_cashflow_balance_adjustments',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          flowDirection: 'inflow',
        },
      })) as CallToolResult;

      expect(
        transactionAnalysisService.getBalanceAdjustments,
      ).toHaveBeenCalledWith(
        '2026-03-01',
        '2026-03-31',
        'BALANCE_ADJUSTMENT',
        'inflow',
        mockUserId,
      );
      expect(result.structuredContent).toMatchObject({
        data: [
          {
            deltaAmount: {
              amount: 75,
              currency: 'USD',
              sign: MoneySign.POSITIVE,
            },
            startBalance: {
              amount: 100,
              currency: 'USD',
              sign: MoneySign.POSITIVE,
            },
            endBalance: {
              amount: 175,
              currency: 'USD',
              sign: MoneySign.POSITIVE,
            },
          },
        ],
        query: {
          categoryPrimary: 'BALANCE_ADJUSTMENT',
          flowDirection: 'inflow',
        },
      });
    } finally {
      await close();
    }
  });
});
