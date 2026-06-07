import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ElicitRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { SpliceMcpService } from '../../src/mcp/mcp.service';
import { MoneySign } from '../../src/types/MoneyWithSign';

const mockUserId = '00000000-0000-0000-0000-000000000001';
const mockAccountId = '11111111-1111-4111-8111-111111111111';
const mockCategoryId = '22222222-2222-4222-8222-222222222222';

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
    listInvestmentHoldings: jest.fn(),
    listInvestmentActivity: jest.fn(),
    listRecurringManualTransactionSchedules: jest.fn(),
    listAnalysisRules: jest.fn(),
    listCategorizationRules: jest.fn(),
    listCategorizationRuleRecommendations: jest.fn(),
  };
  const transactionAnalysisService = {
    getAnalysis: jest.fn(),
    getCategoryTransactions: jest.fn(),
    getAnalysisAudit: jest.fn(),
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

  async function connect(
    server: McpServer,
    options?: ConstructorParameters<typeof Client>[1],
  ) {
    const client = new Client(
      {
        name: 'splice-mcp-test-client',
        version: '1.0.0',
      },
      options,
    );
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
        'collect_projection_assumptions',
        'get_accounts_snapshot',
        'get_balance_history',
        'get_cashflow_analysis',
        'get_cashflow_analysis_audit',
        'get_user_context',
        'list_analysis_rules',
        'list_balance_snapshots',
        'list_cashflow_category_transactions',
        'list_categories',
        'list_categorization_rule_recommendations',
        'list_categorization_rules',
        'list_investment_activity',
        'list_investment_holdings',
        'list_recurring_manual_transaction_schedules',
        'list_transactions',
        'search_transactions',
        'show_cashflow_explorer',
        'show_category_rule_workbench',
        'show_portfolio_viewer',
        'show_projection_scenario_modeler',
      ]);
      expect(
        result.tools.every(
          (tool) =>
            tool.outputSchema &&
            tool.annotations?.readOnlyHint === true &&
            tool.annotations.destructiveHint === false &&
            tool.annotations.idempotentHint === true &&
            tool.annotations.openWorldHint === false,
        ),
      ).toBe(true);
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
      expect(
        'text' in guide.contents[0] ? guide.contents[0].text : '',
      ).toContain('list_investment_holdings');
      expect(
        'text' in guide.contents[0] ? guide.contents[0].text : '',
      ).toContain('list_recurring_manual_transaction_schedules');
      expect(
        'text' in guide.contents[0] ? guide.contents[0].text : '',
      ).toContain('exact category IDs');
      expect(
        'text' in guide.contents[0] ? guide.contents[0].text : '',
      ).toContain('list_analysis_rules');
      expect(
        'text' in guide.contents[0] ? guide.contents[0].text : '',
      ).toContain('outputSchema');
      expect(
        'text' in guide.contents[0] ? guide.contents[0].text : '',
      ).toContain('monthly_cashflow_review');
    } finally {
      await close();
    }
  });

  it('exposes MCP Apps resources and report resource templates', async () => {
    transactionAnalysisService.getAnalysis.mockResolvedValue({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      currency: 'USD',
      inflows: [],
      outflows: [],
      totalInflow: 0,
      totalOutflow: 0,
      netFlow: 0,
      uncategorizedInflow: 0,
      uncategorizedOutflow: 0,
    });
    accountsSurfaceService.getAccountsSnapshot.mockResolvedValue({
      accounts: [{ id: mockAccountId, displayName: 'Checking' }],
    });
    mcpReadService.listCategories.mockResolvedValue({
      data: [],
      query: { includeArchived: false },
    });
    mcpReadService.listAnalysisRules.mockResolvedValue({
      data: [],
      query: { archived: false },
    });
    mcpReadService.listCategorizationRules.mockResolvedValue({
      data: [],
      query: { archived: false },
    });
    mcpReadService.listInvestmentHoldings.mockResolvedValue({
      data: [],
      query: { latestOnly: true },
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      const resources = await client.listResources();
      expect(resources.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: 'ui://splice/cashflow-explorer.html',
            mimeType: 'text/html;profile=mcp-app',
          }),
          expect.objectContaining({
            uri: 'ui://splice/projection-scenario-modeler.html',
            mimeType: 'text/html;profile=mcp-app',
          }),
        ]),
      );

      const app = await client.readResource({
        uri: 'ui://splice/cashflow-explorer.html',
      });
      expect(app.contents[0]).toMatchObject({
        mimeType: 'text/html;profile=mcp-app',
      });
      expect('text' in app.contents[0] ? app.contents[0].text : '').toContain(
        'data-splice-mcp-app',
      );

      const templates = await client.listResourceTemplates();
      expect(
        templates.resourceTemplates.map((item) => item.uriTemplate),
      ).toEqual(
        expect.arrayContaining([
          'splice://reports/cashflow/{startDate}/{endDate}',
          'splice://accounts/{accountId}/snapshot',
          'splice://categories/taxonomy',
          'splice://rules/analysis',
          'splice://portfolio/holdings/latest',
        ]),
      );

      const cashflow = await client.readResource({
        uri: 'splice://reports/cashflow/2026-03-01/2026-03-31',
      });
      expect(cashflow.contents[0]).toMatchObject({
        mimeType: 'application/json',
      });
      expect(transactionAnalysisService.getAnalysis).toHaveBeenCalledWith(
        '2026-03-01',
        '2026-03-31',
        mockUserId,
      );

      await client.readResource({
        uri: `splice://accounts/${mockAccountId}/snapshot`,
      });
      expect(accountsSurfaceService.getAccountsSnapshot).toHaveBeenCalledWith(
        mockUserId,
      );
    } finally {
      await close();
    }
  });

  it('exposes workflow prompts with deterministic tool guidance', async () => {
    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name).sort()).toEqual([
        'category_cleanup_audit',
        'monthly_cashflow_review',
        'portfolio_snapshot',
        'projection_builder',
        'tax_or_refund_anomaly_review',
      ]);

      const prompt = await client.getPrompt({
        name: 'projection_builder',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          reportingCurrency: 'USD',
        },
      });
      const text =
        prompt.messages[0].content.type === 'text'
          ? prompt.messages[0].content.text
          : '';
      expect(text).toContain('get_accounts_snapshot');
      expect(text).toContain('collect_projection_assumptions');
      expect(text).toContain('Do not invent');
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
          categoryId: mockCategoryId,
          amountSign: 'negative',
          reportingCurrency: 'USD',
          pageSize: 50,
        },
      });

      expect(mcpReadService.listTransactions).toHaveBeenCalledWith(mockUserId, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        merchantQuery: 'coffee',
        categoryId: mockCategoryId,
        amountSign: 'negative',
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
          includeArchived: true,
        },
      });

      expect(mcpReadService.listCategories).toHaveBeenCalledWith(mockUserId, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        includeArchived: true,
      });
    } finally {
      await close();
    }
  });

  it('delegates list_investment_holdings to the MCP read service', async () => {
    mcpReadService.listInvestmentHoldings.mockResolvedValue({
      data: [],
      query: { latestOnly: true },
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      await client.callTool({
        name: 'list_investment_holdings',
        arguments: {
          accountIds: [mockAccountId],
          latestOnly: true,
        },
      });

      expect(mcpReadService.listInvestmentHoldings).toHaveBeenCalledWith(
        mockUserId,
        {
          accountIds: [mockAccountId],
          latestOnly: true,
        },
      );
    } finally {
      await close();
    }
  });

  it('delegates list_investment_activity to the MCP read service', async () => {
    mcpReadService.listInvestmentActivity.mockResolvedValue({
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
        name: 'list_investment_activity',
        arguments: {
          accountIds: [mockAccountId],
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          type: 'buy',
          pageSize: 25,
        },
      });

      expect(mcpReadService.listInvestmentActivity).toHaveBeenCalledWith(
        mockUserId,
        {
          accountIds: [mockAccountId],
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          type: 'buy',
          pageSize: 25,
        },
      );
    } finally {
      await close();
    }
  });

  it('delegates list_recurring_manual_transaction_schedules to the MCP read service', async () => {
    mcpReadService.listRecurringManualTransactionSchedules.mockResolvedValue({
      data: [],
      query: { includePaused: false },
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      await client.callTool({
        name: 'list_recurring_manual_transaction_schedules',
        arguments: { includePaused: false },
      });

      expect(
        mcpReadService.listRecurringManualTransactionSchedules,
      ).toHaveBeenCalledWith(mockUserId, { includePaused: false });
    } finally {
      await close();
    }
  });

  it('delegates rule introspection tools to the MCP read service', async () => {
    mcpReadService.listAnalysisRules.mockResolvedValue({
      data: [],
      query: { archived: true },
    });
    mcpReadService.listCategorizationRules.mockResolvedValue({
      data: [],
      query: { archived: false },
    });
    mcpReadService.listCategorizationRuleRecommendations.mockResolvedValue({
      generation: null,
      suggestions: [],
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      await client.callTool({
        name: 'list_analysis_rules',
        arguments: { archived: true },
      });
      await client.callTool({
        name: 'list_categorization_rules',
        arguments: {},
      });
      await client.callTool({
        name: 'list_categorization_rule_recommendations',
        arguments: {},
      });

      expect(mcpReadService.listAnalysisRules).toHaveBeenCalledWith(
        mockUserId,
        { archived: true },
      );
      expect(mcpReadService.listCategorizationRules).toHaveBeenCalledWith(
        mockUserId,
        {},
      );
      expect(
        mcpReadService.listCategorizationRuleRecommendations,
      ).toHaveBeenCalledWith(mockUserId);
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

  it('returns app-backed fallback data for MCP Apps tools', async () => {
    transactionAnalysisService.getAnalysis.mockResolvedValue({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      currency: 'USD',
      inflows: [],
      outflows: [],
      totalInflow: 0,
      totalOutflow: 0,
      netFlow: 0,
      uncategorizedInflow: 0,
      uncategorizedOutflow: 0,
    });
    mcpReadService.listInvestmentHoldings.mockResolvedValue({
      data: [],
      query: { latestOnly: true },
    });
    mcpReadService.listInvestmentActivity.mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasMore: false },
      query: {},
    });

    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      const tools = await client.listTools();
      expect(
        tools.tools.find((tool) => tool.name === 'show_cashflow_explorer')
          ?._meta,
      ).toMatchObject({
        ui: { resourceUri: 'ui://splice/cashflow-explorer.html' },
        'openai/outputTemplate': 'ui://splice/cashflow-explorer.html',
      });

      const cashflow = (await client.callTool({
        name: 'show_cashflow_explorer',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
        },
      })) as CallToolResult;
      expect(cashflow.structuredContent).toMatchObject({
        app: {
          id: 'cashflow_explorer',
          resourceUri: 'ui://splice/cashflow-explorer.html',
        },
      });

      const portfolio = (await client.callTool({
        name: 'show_portfolio_viewer',
        arguments: {
          accountIds: [mockAccountId],
        },
      })) as CallToolResult;
      expect(portfolio.structuredContent).toMatchObject({
        app: { id: 'portfolio_viewer' },
      });
      expect(mcpReadService.listInvestmentHoldings).toHaveBeenCalledWith(
        mockUserId,
        { accountIds: [mockAccountId] },
      );
    } finally {
      await close();
    }
  });

  it('falls back when projection elicitation is unsupported', async () => {
    const { client, close } = await connect(service.createServer(mockUserId));

    try {
      const result = (await client.callTool({
        name: 'collect_projection_assumptions',
        arguments: {},
      })) as CallToolResult;

      expect(result.structuredContent).toMatchObject({
        source: 'fallback',
        inputRequired: expect.objectContaining({
          fields: expect.arrayContaining(['horizonDate']),
        }),
      });
    } finally {
      await close();
    }
  });

  it('collects projection assumptions with supported elicitation', async () => {
    const server = service.createServer(mockUserId);
    const { client, close } = await connect(server, {
      capabilities: {
        elicitation: {},
      },
    });
    client.setRequestHandler(ElicitRequestSchema, (request) => {
      if (request.params.mode === 'url') {
        throw new Error('Expected form elicitation');
      }
      expect(request.params.requestedSchema.properties).toHaveProperty(
        'horizonDate',
      );
      expect(JSON.stringify(request.params.requestedSchema)).not.toContain(
        'password',
      );

      return {
        action: 'accept',
        content: {
          horizonDate: '2027-12-31',
          goalName: 'Runway',
          recurringIncomeAdjustment: 500,
          recurringExpenseAdjustment: 100,
          oneTimeEventsText: '2027-06-01 -5000 USD negative car repair',
          expectedAnnualReturnPercent: 5,
        },
      };
    });

    try {
      const result = (await client.callTool({
        name: 'collect_projection_assumptions',
        arguments: {
          suggestedHorizonDate: '2027-12-31',
          goalName: 'Runway',
        },
      })) as CallToolResult;

      expect(result.structuredContent).toMatchObject({
        source: 'elicited',
        assumptions: {
          horizonDate: '2027-12-31',
          goalName: 'Runway',
        },
      });
    } finally {
      await close();
    }
  });
});
