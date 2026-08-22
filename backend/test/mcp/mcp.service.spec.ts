import {
  createMcpServer,
  createRequestContext,
  McpPublicError,
  silentLogger,
  validateMcpApps,
} from '@koonweee/mcp-kit';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import {
  type CallToolResult,
  type McpServer,
} from '@modelcontextprotocol/server';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  SPLICE_MCP_TOOL_NAMES,
  createSpliceMcpDependencies,
  spliceMcpDefinition,
} from '../../src/mcp/mcp.definition';
import { createSpliceMcpAppResources } from '../../src/mcp/mcp-apps';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { CASH_FLOW_TOOL_SELECTION_EVALS } from './fixtures/cash-flow-tool-selection-evals';
import { PRE_PORT_MCP_CONTRACT } from './fixtures/pre-port-contract';

const mockUserId = '00000000-0000-0000-0000-000000000001';
const mockAccountId = '11111111-1111-4111-8111-111111111111';
const mockCategoryId = '22222222-2222-4222-8222-222222222222';
const RETIRED_APP_TOOL_NAMES = new Set([
  'show_projection_scenario_modeler',
  'show_category_rule_workbench',
]);
const RETIRED_APP_RESOURCE_URIS = new Set([
  'ui://splice/projection-scenario-modeler.html',
  'ui://splice/category-rule-workbench.html',
]);
const REPLACED_CASH_FLOW_TOOL = 'show_cashflow_explorer';
const REPLACED_CASH_FLOW_RESOURCE = 'ui://splice/cashflow-explorer.html';
const REPLACED_PORTFOLIO_TOOL = 'show_portfolio_viewer';
const REPLACED_PORTFOLIO_RESOURCE = 'ui://splice/portfolio-viewer.html';
const INTENTIONALLY_UPDATED_CASH_FLOW_GUIDANCE_TOOLS = new Set([
  'list_transactions',
  'get_cashflow_analysis',
  'list_cashflow_category_transactions',
  'get_cashflow_analysis_audit',
]);
const ADDED_CATEGORIZATION_LIFECYCLE_TOOLS = new Set([
  'get_categorization_rule',
  'preview_categorization_rule_edit',
  'edit_categorization_rule',
  'preview_categorization_rule_archive',
  'archive_categorization_rule',
  'preview_categorization_rule_restore',
  'restore_categorization_rule',
]);
const UPDATED_CATEGORIZATION_GUIDANCE_TOOLS = new Set([
  'list_categorization_rules',
  'create_categorization_rule',
  'preview_categorization_rule_application',
  'apply_categorization_rule',
]);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeVersionedAppUris(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeVersionedAppUris);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeVersionedAppUris(item),
      ]),
    );
  }
  if (typeof value === 'string') {
    return value.replace(/\/v\d+\.html$/, '.html');
  }
  return value;
}

describe('Splice MCP definition', () => {
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
  const mcpPortfolioVisualizationService = {
    visualize: jest.fn(),
  };
  const mcpCategorizationService = {
    getRule: jest.fn(),
    listManualCategorizedTransactionExamples: jest.fn(),
    listRuleCandidatePatterns: jest.fn(),
    previewDraft: jest.fn(),
    createRule: jest.fn(),
    previewRuleEdit: jest.fn(),
    editRule: jest.fn(),
    previewRuleArchive: jest.fn(),
    archiveRule: jest.fn(),
    previewRuleRestore: jest.fn(),
    restoreRule: jest.fn(),
    previewRuleApplication: jest.fn(),
    applyRule: jest.fn(),
  };
  const transactionAnalysisService = {
    getAnalysis: jest.fn(),
    getCategoryTransactions: jest.fn(),
    getAnalysisAudit: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function connect(
    serverOrPromise: McpServer | Promise<McpServer>,
    options?: ConstructorParameters<typeof Client>[1],
  ) {
    const server = await serverOrPromise;
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

  function createServer(
    userId: string,
    scopes: readonly string[] = ['splice:read', 'splice:write'],
    definition: typeof spliceMcpDefinition = spliceMcpDefinition,
  ): Promise<McpServer> {
    return createMcpServer(
      definition,
      createRequestContext({
        requestId: 'mcp-service-spec',
        principal: {
          subject: `google-oauth2|${userId}`,
          scopes: new Set(scopes),
        },
        logger: silentLogger,
        dependencies: createSpliceMcpDependencies(userId, {
          userService: userService as never,
          accountsSurfaceService: accountsSurfaceService as never,
          balanceHistorySurfaceService: balanceHistorySurfaceService as never,
          transactionsSurfaceService: transactionsSurfaceService as never,
          mcpReadService: mcpReadService as never,
          mcpPortfolioVisualizationService:
            mcpPortfolioVisualizationService as never,
          mcpCategorizationService: mcpCategorizationService as never,
          transactionAnalysisService: transactionAnalysisService as never,
        }),
      }),
    );
  }

  it('registers MCP tools with read and write annotations', async () => {
    const { client, close } = await connect(createServer(mockUserId));

    try {
      const result = await client.listTools();
      const toolsByName = new Map(
        result.tools.map((tool) => [tool.name, tool]),
      );
      const readOnlyToolNames = [
        'collect_projection_assumptions',
        'get_accounts_snapshot',
        'get_balance_history',
        'get_cashflow_analysis',
        'get_cashflow_analysis_audit',
        'get_categorization_rule',
        'get_user_context',
        'list_analysis_rules',
        'list_balance_snapshots',
        'list_cashflow_category_transactions',
        'list_categories',
        'list_categorization_rule_recommendations',
        'list_categorization_rules',
        'list_investment_activity',
        'list_investment_holdings',
        'list_manual_categorized_transaction_examples',
        'list_recurring_manual_transaction_schedules',
        'list_rule_candidate_patterns',
        'list_transactions',
        'preview_categorization_rule_application',
        'preview_categorization_rule_archive',
        'preview_categorization_rule_draft',
        'preview_categorization_rule_edit',
        'preview_categorization_rule_restore',
        'search_transactions',
        'visualize_cash_flow',
        'visualize_portfolio',
      ];

      expect(result.tools.map((tool) => tool.name).sort()).toEqual([
        'apply_categorization_rule',
        'archive_categorization_rule',
        'collect_projection_assumptions',
        'create_categorization_rule',
        'edit_categorization_rule',
        'get_accounts_snapshot',
        'get_balance_history',
        'get_cashflow_analysis',
        'get_cashflow_analysis_audit',
        'get_categorization_rule',
        'get_user_context',
        'list_analysis_rules',
        'list_balance_snapshots',
        'list_cashflow_category_transactions',
        'list_categories',
        'list_categorization_rule_recommendations',
        'list_categorization_rules',
        'list_investment_activity',
        'list_investment_holdings',
        'list_manual_categorized_transaction_examples',
        'list_recurring_manual_transaction_schedules',
        'list_rule_candidate_patterns',
        'list_transactions',
        'preview_categorization_rule_application',
        'preview_categorization_rule_archive',
        'preview_categorization_rule_draft',
        'preview_categorization_rule_edit',
        'preview_categorization_rule_restore',
        'restore_categorization_rule',
        'search_transactions',
        'visualize_cash_flow',
        'visualize_portfolio',
      ]);
      expect(result.tools.map((tool) => tool.name)).toEqual([
        ...SPLICE_MCP_TOOL_NAMES,
      ]);
      expect(result.tools).toHaveLength(32);
      expect(toolsByName.has('show_cashflow_explorer')).toBe(false);
      expect(toolsByName.has('show_portfolio_viewer')).toBe(false);
      expect(toolsByName.get('visualize_cash_flow')).toMatchObject({
        title: 'Visualize Cash Flow',
        description: expect.stringContaining('for capability discovery'),
        inputSchema: {
          required: ['startDate', 'endDate'],
          properties: {
            direction: expect.any(Object),
            focusCategoryPrimary: expect.any(Object),
            comparison: expect.objectContaining({
              required: ['startDate', 'endDate'],
            }),
          },
        },
      });
      expect(toolsByName.get('visualize_portfolio')).toMatchObject({
        title: 'Visualize Portfolio',
        description: expect.stringContaining(
          'Do not call for capability discovery',
        ),
        inputSchema: {
          properties: {
            accountIds: expect.objectContaining({ minItems: 1, maxItems: 100 }),
          },
        },
      });

      const definitionsByName = new Map(
        spliceMcpDefinition.tools.map((tool) => [tool.name, tool]),
      );
      for (const name of readOnlyToolNames) {
        expect(toolsByName.get(name)).toMatchObject({
          outputSchema: expect.any(Object),
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        });
        expect(definitionsByName.get(name)).toMatchObject({
          requiredScopes: ['splice:read'],
          risk: { kind: 'read' },
        });
      }
      expect(toolsByName.get('create_categorization_rule')).toMatchObject({
        outputSchema: expect.any(Object),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      });
      expect(definitionsByName.get('create_categorization_rule')).toMatchObject(
        {
          requiredScopes: ['splice:write'],
          risk: { kind: 'mutating' },
        },
      );
      expect(toolsByName.get('apply_categorization_rule')).toMatchObject({
        outputSchema: expect.any(Object),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      });
      expect(definitionsByName.get('apply_categorization_rule')).toMatchObject({
        requiredScopes: ['splice:write'],
        risk: { kind: 'destructive', idempotent: true },
      });
      expect(toolsByName.get('edit_categorization_rule')).toMatchObject({
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      });
      expect(toolsByName.get('archive_categorization_rule')).toMatchObject({
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      });
      expect(toolsByName.get('restore_categorization_rule')).toMatchObject({
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      });
      expect(
        toolsByName.get('create_categorization_rule')?.description,
      ).toContain('Do not use this to change an existing rule');
      expect(
        toolsByName.get('edit_categorization_rule')?.description,
      ).toContain('future matching only');
      expect(
        toolsByName.get('apply_categorization_rule')?.description,
      ).toContain('historical non-manual transactions');
      expect(
        toolsByName.get('archive_categorization_rule')?.description,
      ).toContain('Existing transaction categories remain untouched');
      expect(
        toolsByName.get('restore_categorization_rule')?.description,
      ).toContain('future matching only');
    } finally {
      await close();
    }
  });

  it('publishes an unambiguous Cash Flow tool-selection hierarchy', async () => {
    const { client, close } = await connect(createServer(mockUserId));

    try {
      const result = await client.listTools();
      const toolsByName = new Map(
        result.tools.map((tool) => [tool.name, tool]),
      );
      const visualizeDescription =
        toolsByName.get('visualize_cash_flow')?.description ?? '';
      const analysisDescription =
        toolsByName.get('get_cashflow_analysis')?.description ?? '';
      const drilldownDescription =
        toolsByName.get('list_cashflow_category_transactions')?.description ??
        '';
      const auditDescription =
        toolsByName.get('get_cashflow_analysis_audit')?.description ?? '';
      const rawDescription =
        toolsByName.get('list_transactions')?.description ?? '';
      const visualizationInput = toolsByName.get('visualize_cash_flow')
        ?.inputSchema as {
        properties?: Record<string, { description?: string }>;
      };

      expect(visualizeDescription).toContain('Preferred/default tool');
      expect(visualizeDescription).toContain(
        'What were my expenses like last month?',
      );
      expect(visualizeDescription).toContain(
        'What was my income like last month?',
      );
      expect(visualizeDescription).toContain('prose only');
      expect(visualizeDescription).toContain('capability discovery');
      expect(analysisDescription).toContain('data/analysis primitive');
      expect(analysisDescription).toContain(
        'Do not prefer this over visualize_cash_flow',
      );
      expect(drilldownDescription).toContain('selected or specific category');
      expect(drilldownDescription).toContain('not a broad spending overview');
      expect(auditDescription).toContain('debugging or explaining');
      expect(auditDescription).toContain('not a spending overview');
      expect(rawDescription).toContain('cash-flow abstraction is insufficient');
      expect(rawDescription).toContain('not the default for a broad');
      expect(visualizationInput.properties?.startDate?.description).toContain(
        'get_user_context',
      );
      expect(visualizationInput.properties?.direction?.description).toContain(
        'spending or expense',
      );

      expect(
        CASH_FLOW_TOOL_SELECTION_EVALS.map(({ prompt }) => prompt),
      ).toEqual(
        expect.arrayContaining([
          'What were my expenses like last month?',
          'How was my spending last month?',
          'Where did my money go in July?',
          'Show me my expenses for July.',
          "How's my cash flow this month?",
          'What does cash flow mean?',
          'How much did I spend last month? Answer in prose, no visualization.',
          'List my five largest transactions in July.',
          'What visualizations can Splice render?',
        ]),
      );
      for (const evalCase of CASH_FLOW_TOOL_SELECTION_EVALS) {
        if (evalCase.forbiddenTools.includes('visualize_cash_flow')) {
          expect(evalCase.requiredToolsInOrder).not.toContain(
            'visualize_cash_flow',
          );
        } else {
          expect(evalCase.requiredToolsInOrder.slice(0, 2)).toEqual([
            'get_user_context',
            'visualize_cash_flow',
          ]);
          expect(evalCase.expectedDirection).toMatch(/^(outflow|inflow)$/);
        }
      }
    } finally {
      await close();
    }
  });

  it('passes the OpenAI submission profile with scoped App resources', () => {
    expect(() =>
      validateMcpApps(spliceMcpDefinition, {
        profile: 'openai-submission',
      }),
    ).not.toThrow();
    expect(spliceMcpDefinition.apps?.resources).toHaveLength(2);
    expect(
      spliceMcpDefinition.apps?.resources.map((resource) => ({
        uri: resource.uri,
        requiredScopes: resource.requiredScopes,
      })),
    ).toEqual([
      {
        uri: 'ui://splice/cash-flow/v3.html',
        requiredScopes: ['splice:read'],
      },
      {
        uri: 'ui://splice/portfolio/v3.html',
        requiredScopes: ['splice:read'],
      },
    ]);
  });

  it('matches the retained pre-port contract after intentional App retirement', async () => {
    const { client, close } = await connect(createServer(mockUserId));

    try {
      const retainedTools = PRE_PORT_MCP_CONTRACT.tools.filter(
        (name) =>
          !RETIRED_APP_TOOL_NAMES.has(name) &&
          name !== REPLACED_CASH_FLOW_TOOL &&
          name !== REPLACED_PORTFOLIO_TOOL,
      );
      const retainedToolContracts =
        PRE_PORT_MCP_CONTRACT.toolContractSha256.filter(
          ({ name }) =>
            !RETIRED_APP_TOOL_NAMES.has(name) &&
            name !== REPLACED_CASH_FLOW_TOOL &&
            name !== REPLACED_PORTFOLIO_TOOL &&
            !UPDATED_CATEGORIZATION_GUIDANCE_TOOLS.has(name) &&
            !INTENTIONALLY_UPDATED_CASH_FLOW_GUIDANCE_TOOLS.has(name),
        );
      const retainedResources = PRE_PORT_MCP_CONTRACT.fixedResources.filter(
        (uri) =>
          !RETIRED_APP_RESOURCE_URIS.has(uri) &&
          uri !== REPLACED_CASH_FLOW_RESOURCE &&
          uri !== REPLACED_PORTFOLIO_RESOURCE,
      );

      const listedTools = await client.listTools();
      expect(SPLICE_MCP_TOOL_NAMES).toHaveLength(
        retainedTools.length + 2 + ADDED_CATEGORIZATION_LIFECYCLE_TOOLS.size,
      );
      expect(
        listedTools.tools
          .map((tool) => tool.name)
          .filter(
            (name) =>
              name !== 'visualize_cash_flow' &&
              name !== 'visualize_portfolio' &&
              !ADDED_CATEGORIZATION_LIFECYCLE_TOOLS.has(name),
          ),
      ).toEqual(retainedTools);
      expect(
        listedTools.tools
          .filter(
            (tool) =>
              tool.name !== 'visualize_cash_flow' &&
              tool.name !== 'visualize_portfolio' &&
              !ADDED_CATEGORIZATION_LIFECYCLE_TOOLS.has(tool.name) &&
              !UPDATED_CATEGORIZATION_GUIDANCE_TOOLS.has(tool.name) &&
              !INTENTIONALLY_UPDATED_CASH_FLOW_GUIDANCE_TOOLS.has(tool.name),
          )
          .map((tool) => ({
            name: tool.name,
            sha256: createHash('sha256')
              .update(canonicalJson(normalizeVersionedAppUris(tool)))
              .digest('hex'),
          })),
      ).toEqual(retainedToolContracts);
      for (const retiredTool of RETIRED_APP_TOOL_NAMES) {
        expect(
          listedTools.tools.some((tool) => tool.name === retiredTool),
        ).toBe(false);
      }

      const listedResources = await client.listResources();
      expect(
        listedResources.resources
          .filter(
            (resource) =>
              resource.uri !== 'ui://splice/cash-flow/v3.html' &&
              resource.uri !== 'ui://splice/portfolio/v3.html',
          )
          .map((resource) => normalizeVersionedAppUris(resource.uri))
          .sort(),
      ).toEqual([...retainedResources].sort());
      const templates = await client.listResourceTemplates();
      expect(
        templates.resourceTemplates.map((template) => template.uriTemplate),
      ).toEqual(PRE_PORT_MCP_CONTRACT.resourceTemplates);
      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name).sort()).toEqual(
        [...PRE_PORT_MCP_CONTRACT.prompts].sort(),
      );

      const toolsByName = new Map(
        listedTools.tools.map((tool) => [tool.name, tool]),
      );
      for (const [toolName, resourceUri] of Object.entries(
        PRE_PORT_MCP_CONTRACT.apps,
      )) {
        if (
          RETIRED_APP_TOOL_NAMES.has(toolName) ||
          toolName === REPLACED_CASH_FLOW_TOOL ||
          toolName === REPLACED_PORTFOLIO_TOOL
        )
          continue;
        expect(toolsByName.get(toolName)?._meta).toMatchObject({
          ui: {
            resourceUri: expect.stringMatching(
              new RegExp(
                `^${resourceUri.replace('.html', '(?:/v2)?\\.html')}$`,
              ),
            ),
          },
        });
      }
      for (const [toolName, fields] of Object.entries(
        PRE_PORT_MCP_CONTRACT.paginatedOutputs,
      )) {
        const outputSchema = JSON.stringify(
          toolsByName.get(toolName)?.outputSchema,
        );
        for (const field of fields)
          expect(outputSchema).toContain(`"${field}"`);
      }
      for (const toolName of ['get_cashflow_analysis']) {
        const outputSchema = JSON.stringify(
          toolsByName.get(toolName)?.outputSchema,
        );
        for (const field of PRE_PORT_MCP_CONTRACT.moneyFields) {
          expect(outputSchema).toContain(`"${field}"`);
        }
      }
      for (const [toolName, write] of Object.entries(
        PRE_PORT_MCP_CONTRACT.writes,
      )) {
        expect(
          JSON.stringify(toolsByName.get(toolName)?.inputSchema),
        ).toContain(`"${write.requiredInput}"`);
        expect(toolsByName.has(write.preview)).toBe(true);
        const definition = spliceMcpDefinition.tools.find(
          (tool) => tool.name === toolName,
        );
        expect(definition?.risk.kind).toBe(write.risk);
        if ('idempotent' in write) {
          expect(definition?.risk).toMatchObject({ idempotent: true });
        }
      }
      const projection = (await client.callTool({
        name: 'collect_projection_assumptions',
        arguments: {},
      })) as CallToolResult;
      expect(projection.structuredContent).toMatchObject({
        source: 'fallback',
        inputRequired: {
          fields: PRE_PORT_MCP_CONTRACT.projection.fields,
        },
      });
    } finally {
      await close();
    }
  });

  it('exposes calling-LLM guidance as a resource', async () => {
    const { client, close } = await connect(createServer(mockUserId));

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
      ).toContain('call visualize_cash_flow by default');
      expect(
        'text' in guide.contents[0] ? guide.contents[0].text : '',
      ).toContain('Use get_cashflow_analysis as a structured data/analysis');
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
      expect(
        'text' in guide.contents[0] ? guide.contents[0].text : '',
      ).toContain('OAuth access uses splice:read');
      expect(
        'text' in guide.contents[0] ? guide.contents[0].text : '',
      ).toContain('preview then edit an existing rule');
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

    const { client, close } = await connect(createServer(mockUserId));

    try {
      const resources = await client.listResources();
      expect(resources.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uri: 'ui://splice/cash-flow/v3.html',
            mimeType: 'text/html;profile=mcp-app',
          }),
          expect.objectContaining({
            uri: 'ui://splice/portfolio/v3.html',
            mimeType: 'text/html;profile=mcp-app',
          }),
        ]),
      );

      const appUris = [
        'ui://splice/cash-flow/v3.html',
        'ui://splice/portfolio/v3.html',
      ];
      for (const uri of appUris) {
        expect(
          resources.resources.find((resource) => resource.uri === uri),
        ).toMatchObject({
          _meta: {
            ui: { domain: 'https://splice-mcp.kw0.dev' },
            'openai/widgetDomain': 'https://splice-mcp.kw0.dev',
          },
        });
      }
      const appReads = await Promise.all(
        appUris.map((uri) => client.readResource({ uri })),
      );
      for (const [index, appRead] of appReads.entries()) {
        expect(appRead.contents[0]).toMatchObject({
          uri: appUris[index],
          mimeType: 'text/html;profile=mcp-app',
          _meta: {
            ui: {
              domain: 'https://splice-mcp.kw0.dev',
              csp: {
                connectDomains: [],
                resourceDomains: [],
                frameDomains: [],
                baseUriDomains: [],
              },
              prefersBorder: true,
            },
            'openai/widgetDomain': 'https://splice-mcp.kw0.dev',
            'openai/widgetCSP': {
              connect_domains: [],
              resource_domains: [],
              frame_domains: [],
            },
            'openai/widgetPrefersBorder': true,
          },
        });
      }
      for (const app of appReads) {
        const html = 'text' in app.contents[0] ? app.contents[0].text : '';
        expect(html).toContain('data-splice-mcp-app');
        expect(html).toContain('id="splice-mcp-app-safe-area"');
        expect(html).toContain('Loading live Splice data');
        expect(html).not.toMatch(
          /splice-mcp-app-fixture|Rendering local fixture|fixture-(?:account|activity|audit|category|holding|income|recommendation|rule|schedule|transaction)|2026-03-31|6250|3120|3130/i,
        );
        expect(html).not.toMatch(/splice_pat_|password|access_token/i);
      }

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

  it('requires splice:read before every guide, App, and data resource read', async () => {
    const renderApp = jest.fn(() => '<html>scope check failed</html>');
    const scopedDefinition = {
      ...spliceMcpDefinition,
      apps: {
        ...spliceMcpDefinition.apps,
        resources: createSpliceMcpAppResources(renderApp),
      },
    };
    const { client, close } = await connect(
      createServer(mockUserId, [], scopedDefinition),
    );
    const resourceUris = [
      'splice://mcp-guide',
      'ui://splice/cash-flow/v3.html',
      'ui://splice/portfolio/v3.html',
      'splice://reports/cashflow/2026-03-01/2026-03-31',
      `splice://accounts/${mockAccountId}/snapshot`,
      'splice://categories/taxonomy',
      'splice://rules/analysis',
      'splice://portfolio/holdings/latest',
    ];

    try {
      for (const uri of resourceUris) {
        await expect(client.readResource({ uri })).rejects.toThrow(
          'Insufficient scope',
        );
      }

      expect(transactionAnalysisService.getAnalysis).not.toHaveBeenCalled();
      expect(accountsSurfaceService.getAccountsSnapshot).not.toHaveBeenCalled();
      expect(mcpReadService.listCategories).not.toHaveBeenCalled();
      expect(mcpReadService.listAnalysisRules).not.toHaveBeenCalled();
      expect(mcpReadService.listCategorizationRules).not.toHaveBeenCalled();
      expect(mcpReadService.listInvestmentHoldings).not.toHaveBeenCalled();
      expect(renderApp).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it('sanitizes unexpected extension failures and preserves approved public errors', async () => {
    mcpReadService.listCategories.mockRejectedValue(
      new Error('PRIVATE_RESOURCE_DB_FAILURE'),
    );
    accountsSurfaceService.getAccountsSnapshot.mockResolvedValue({
      accounts: [],
    });
    const { client, close } = await connect(createServer(mockUserId));

    try {
      await expect(
        client.readResource({ uri: 'splice://categories/taxonomy' }),
      ).rejects.toThrow('The MCP request could not be completed');
      await expect(
        client.readResource({ uri: 'splice://categories/taxonomy' }),
      ).rejects.not.toThrow('PRIVATE_RESOURCE_DB_FAILURE');
      await expect(
        client.readResource({
          uri: `splice://accounts/${mockAccountId}/snapshot`,
        }),
      ).rejects.toThrow('Account not found');
      await expect(
        client.getPrompt({
          name: 'monthly_cashflow_review',
          arguments: {
            startDate: '2026-04-01',
            endDate: '2026-03-01',
          },
        }),
      ).rejects.toThrow('startDate must be before or equal to endDate');
    } finally {
      await close();
    }
  });

  it('exposes workflow prompts with deterministic tool guidance', async () => {
    const { client, close } = await connect(createServer(mockUserId));

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

    const { client, close } = await connect(createServer(mockUserId));

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
      expect(result.structuredContent).toHaveProperty(
        'today',
        expect.any(String),
      );
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

    const { client, close } = await connect(createServer(mockUserId));

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

    const { client, close } = await connect(createServer(mockUserId));

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

    const { client, close } = await connect(createServer(mockUserId));

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

    const { client, close } = await connect(createServer(mockUserId));

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

    const { client, close } = await connect(createServer(mockUserId));

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

    const { client, close } = await connect(createServer(mockUserId));

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

    const { client, close } = await connect(createServer(mockUserId));

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

    const { client, close } = await connect(createServer(mockUserId));

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

    const { client, close } = await connect(createServer(mockUserId));

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

    const { client, close } = await connect(createServer(mockUserId));

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

  it('delegates categorization evidence and write tools to the MCP categorization service', async () => {
    const ruleId = '33333333-3333-4333-8333-333333333333';
    const conditions = [
      { field: 'merchantName', operator: 'contains', value: 'uber' },
    ];
    mcpCategorizationService.listManualCategorizedTransactionExamples.mockResolvedValue(
      {
        transactions: [],
      },
    );
    mcpCategorizationService.listRuleCandidatePatterns.mockResolvedValue({
      filters: {
        fields: ['merchantName'],
        minAgreement: 2,
        maxConflictRate: 0,
        limit: 10,
      },
      candidates: [],
    });
    mcpCategorizationService.previewDraft.mockResolvedValue({
      matched: 5,
      updated: 4,
      skippedManual: 1,
      manualAgreement: 1,
      manualConflicts: 0,
      existingRuleOverlap: 0,
      transactions: [],
      normalizedDraft: {
        targetCategoryId: mockCategoryId,
        conditions,
      },
      previewToken: 'draft-token',
    });
    mcpCategorizationService.createRule.mockResolvedValue({
      rule: {
        id: ruleId,
        name: 'Uber rides',
      },
    });
    mcpCategorizationService.previewRuleApplication.mockResolvedValue({
      matched: 5,
      updated: 4,
      skippedManual: 1,
      transactions: [],
      previewToken: 'apply-token',
    });
    mcpCategorizationService.applyRule.mockResolvedValue({
      matched: 5,
      updated: 4,
      skippedManual: 1,
    });

    const { client, close } = await connect(createServer(mockUserId));

    try {
      await client.callTool({
        name: 'list_manual_categorized_transaction_examples',
        arguments: {
          categoryId: mockCategoryId,
          query: 'uber',
          limit: 25,
          ignoredCategoryIds: [mockCategoryId],
        },
      });
      await client.callTool({
        name: 'list_rule_candidate_patterns',
        arguments: {
          fields: ['merchantName'],
          minAgreement: 2,
          maxConflictRate: 0,
          limit: 10,
          ignoredCategoryIds: [mockCategoryId],
        },
      });
      const preview = (await client.callTool({
        name: 'preview_categorization_rule_draft',
        arguments: {
          targetCategoryId: mockCategoryId,
          conditions,
          ignoredManualCategoryIds: [mockCategoryId],
        },
      })) as CallToolResult;
      const created = (await client.callTool({
        name: 'create_categorization_rule',
        arguments: {
          name: 'Uber rides',
          targetCategoryId: mockCategoryId,
          conditions,
          previewToken: 'draft-token',
        },
      })) as CallToolResult;
      const applicationPreview = (await client.callTool({
        name: 'preview_categorization_rule_application',
        arguments: { ruleId },
      })) as CallToolResult;
      const applied = (await client.callTool({
        name: 'apply_categorization_rule',
        arguments: { ruleId, previewToken: 'apply-token' },
      })) as CallToolResult;

      expect(
        mcpCategorizationService.listManualCategorizedTransactionExamples,
      ).toHaveBeenCalledWith(mockUserId, {
        categoryId: mockCategoryId,
        query: 'uber',
        limit: 25,
        ignoredCategoryIds: [mockCategoryId],
      });
      expect(
        mcpCategorizationService.listRuleCandidatePatterns,
      ).toHaveBeenCalledWith(mockUserId, {
        fields: ['merchantName'],
        minAgreement: 2,
        maxConflictRate: 0,
        limit: 10,
        ignoredCategoryIds: [mockCategoryId],
      });
      expect(mcpCategorizationService.previewDraft).toHaveBeenCalledWith(
        mockUserId,
        {
          targetCategoryId: mockCategoryId,
          conditions,
          ignoredManualCategoryIds: [mockCategoryId],
        },
      );
      expect(mcpCategorizationService.createRule).toHaveBeenCalledWith(
        mockUserId,
        {
          name: 'Uber rides',
          targetCategoryId: mockCategoryId,
          conditions,
          previewToken: 'draft-token',
        },
      );
      expect(
        mcpCategorizationService.previewRuleApplication,
      ).toHaveBeenCalledWith(mockUserId, ruleId);
      expect(mcpCategorizationService.applyRule).toHaveBeenCalledWith(
        mockUserId,
        { ruleId, previewToken: 'apply-token' },
      );
      expect(preview.structuredContent).toMatchObject({
        previewToken: 'draft-token',
      });
      expect(created.structuredContent).toMatchObject({
        rule: { id: ruleId },
      });
      expect(applicationPreview.structuredContent).toMatchObject({
        previewToken: 'apply-token',
      });
      expect(applied.structuredContent).toMatchObject({
        updated: 4,
      });
    } finally {
      await close();
    }
  });

  it('delegates categorization rule inspection, edit, archive, and restore lifecycles', async () => {
    const ruleId = '33333333-3333-4333-8333-333333333333';
    const rule = { id: ruleId, name: 'Income', archivedAt: null };
    const impact = {
      matchedBefore: 5,
      matchedAfter: 2,
      newlyMatched: 0,
      noLongerMatched: 3,
      winningBefore: 5,
      winningAfter: 2,
      winnerChanged: 3,
      skippedManual: 1,
      historicalAssignments: 4,
      historicalAssignmentsUntouched: true,
    };
    mcpCategorizationService.getRule.mockResolvedValue(rule);
    mcpCategorizationService.previewRuleEdit.mockResolvedValue({
      action: 'edit',
      currentRule: rule,
      proposedRule: { ...rule, priority: 5 },
      impact,
      transactions: [],
      normalizedChanges: { priority: 5 },
      previewToken: 'edit-token',
    });
    mcpCategorizationService.editRule.mockResolvedValue({
      rule: { ...rule, priority: 5 },
    });
    mcpCategorizationService.previewRuleArchive.mockResolvedValue({
      action: 'archive',
      currentRule: rule,
      proposedRule: { ...rule, archivedAt: '2026-08-22T00:00:00.000Z' },
      impact,
      transactions: [],
      previewToken: 'archive-token',
    });
    mcpCategorizationService.archiveRule.mockResolvedValue({
      rule: { ...rule, archivedAt: '2026-08-22T00:00:00.000Z' },
    });
    mcpCategorizationService.previewRuleRestore.mockResolvedValue({
      action: 'restore',
      currentRule: { ...rule, archivedAt: '2026-08-22T00:00:00.000Z' },
      proposedRule: rule,
      impact,
      transactions: [],
      previewToken: 'restore-token',
    });
    mcpCategorizationService.restoreRule.mockResolvedValue({ rule });

    const { client, close } = await connect(createServer(mockUserId));
    try {
      await client.callTool({
        name: 'get_categorization_rule',
        arguments: { ruleId },
      });
      await client.callTool({
        name: 'preview_categorization_rule_edit',
        arguments: { ruleId, changes: { priority: 5 } },
      });
      await client.callTool({
        name: 'edit_categorization_rule',
        arguments: {
          ruleId,
          changes: { priority: 5 },
          previewToken: 'edit-token',
        },
      });
      await client.callTool({
        name: 'preview_categorization_rule_archive',
        arguments: { ruleId },
      });
      await client.callTool({
        name: 'archive_categorization_rule',
        arguments: { ruleId, previewToken: 'archive-token' },
      });
      await client.callTool({
        name: 'preview_categorization_rule_restore',
        arguments: { ruleId },
      });
      await client.callTool({
        name: 'restore_categorization_rule',
        arguments: { ruleId, previewToken: 'restore-token' },
      });

      expect(mcpCategorizationService.getRule).toHaveBeenCalledWith(
        mockUserId,
        ruleId,
      );
      expect(mcpCategorizationService.previewRuleEdit).toHaveBeenCalledWith(
        mockUserId,
        { ruleId, priority: 5 },
      );
      expect(mcpCategorizationService.editRule).toHaveBeenCalledWith(
        mockUserId,
        { ruleId, priority: 5, previewToken: 'edit-token' },
      );
      expect(mcpCategorizationService.previewRuleArchive).toHaveBeenCalledWith(
        mockUserId,
        ruleId,
      );
      expect(mcpCategorizationService.archiveRule).toHaveBeenCalledWith(
        mockUserId,
        { ruleId, previewToken: 'archive-token' },
      );
      expect(mcpCategorizationService.previewRuleRestore).toHaveBeenCalledWith(
        mockUserId,
        ruleId,
      );
      expect(mcpCategorizationService.restoreRule).toHaveBeenCalledWith(
        mockUserId,
        { ruleId, previewToken: 'restore-token' },
      );
    } finally {
      await close();
    }
  });

  it('preserves safe domain validation errors and sanitizes unknown write failures', async () => {
    const conditions = [
      {
        field: 'merchantName' as const,
        operator: 'contains' as const,
        value: 'uber',
      },
    ];
    const ruleId = '33333333-3333-4333-8333-333333333333';
    mcpCategorizationService.createRule.mockRejectedValueOnce(
      new BadRequestException('Preview token is invalid or expired'),
    );
    mcpCategorizationService.applyRule.mockRejectedValueOnce(
      new Error('PRIVATE_WRITE_DB_FAILURE'),
    );
    const { client, close } = await connect(createServer(mockUserId));

    try {
      const invalidPreview = (await client.callTool({
        name: 'create_categorization_rule',
        arguments: {
          name: 'Uber rides',
          targetCategoryId: mockCategoryId,
          conditions,
          previewToken: 'expired-token',
        },
      })) as CallToolResult;
      expect(invalidPreview).toMatchObject({ isError: true });
      expect(invalidPreview.content[0]).toMatchObject({
        type: 'text',
        text: 'Preview token is invalid or expired',
      });

      const internalFailure = (await client.callTool({
        name: 'apply_categorization_rule',
        arguments: { ruleId, previewToken: 'valid-looking-token' },
      })) as CallToolResult;
      expect(internalFailure).toMatchObject({ isError: true });
      expect(internalFailure.content[0]).toMatchObject({
        type: 'text',
        text: 'The tool could not be completed',
      });
      expect(JSON.stringify(internalFailure)).not.toContain(
        'PRIVATE_WRITE_DB_FAILURE',
      );
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

    const { client, close } = await connect(createServer(mockUserId));

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

    const { client, close } = await connect(createServer(mockUserId));

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

    const { client, close } = await connect(createServer(mockUserId));

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

  it('returns a typed Cash Flow App payload with safe adjustment counts and defaults', async () => {
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
    transactionAnalysisService.getAnalysisAudit.mockResolvedValue({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      neutralizationLookaroundDays: 3,
      rows: [
        { type: 'excluded', private: 'must not escape' },
        { type: 'excluded', private: 'must not escape' },
        { type: 'neutralized', private: 'must not escape' },
      ],
    });
    const { client, close } = await connect(createServer(mockUserId));

    try {
      const result = (await client.callTool({
        name: 'visualize_cash_flow',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          focusCategoryPrimary: 'NOT_PRESENT',
        },
      })) as CallToolResult;

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        app: {
          id: 'cash_flow',
          title: 'Cash Flow',
          resourceUri: 'ui://splice/cash-flow/v3.html',
          initialToolName: 'visualize_cash_flow',
        },
        data: {
          presentation: { direction: 'outflow' },
          current: {
            analysis: {
              startDate: '2026-03-01',
              endDate: '2026-03-31',
              currency: 'USD',
            },
            adjustments: {
              affected: true,
              excludedTransactionCount: 2,
              neutralizedPairCount: 1,
            },
          },
        },
      });
      expect(
        (result.structuredContent as { data: { presentation: object } }).data
          .presentation,
      ).not.toHaveProperty('focusCategoryPrimary');
      expect(JSON.stringify(result.structuredContent)).not.toContain(
        'must not escape',
      );
      const text = result.content.find(
        (content): content is Extract<typeof content, { type: 'text' }> =>
          content.type === 'text',
      )?.text;
      expect(JSON.parse(text ?? '{}')).toEqual(result.structuredContent);
    } finally {
      await close();
    }
  });

  it('loads complete current and comparison periods concurrently and preserves an inflow focus', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started: string[] = [];
    transactionAnalysisService.getAnalysis.mockImplementation(
      async (startDate: string, endDate: string) => {
        started.push(`analysis:${startDate}:${endDate}`);
        await gate;
        return {
          startDate,
          endDate,
          currency: 'USD',
          inflows: [
            {
              primaryCategory: 'INCOME',
              totalAmount: 100000,
              currency: 'USD',
              transactionCount: 1,
              color: '#2f9e44',
            },
          ],
          outflows: [],
          totalInflow: 100000,
          totalOutflow: 0,
          netFlow: 100000,
          uncategorizedInflow: 0,
          uncategorizedOutflow: 0,
        };
      },
    );
    transactionAnalysisService.getAnalysisAudit.mockImplementation(
      async (startDate: string, endDate: string) => {
        started.push(`audit:${startDate}:${endDate}`);
        await gate;
        return {
          startDate,
          endDate,
          neutralizationLookaroundDays: 3,
          rows: [],
        };
      },
    );
    const { client, close } = await connect(createServer(mockUserId));

    try {
      const resultPromise = client.callTool({
        name: 'visualize_cash_flow',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          direction: 'inflow',
          focusCategoryPrimary: 'INCOME',
          comparison: {
            startDate: '2026-02-01',
            endDate: '2026-02-28',
          },
        },
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(started.sort()).toEqual(
        [
          'analysis:2026-02-01:2026-02-28',
          'analysis:2026-03-01:2026-03-31',
          'audit:2026-02-01:2026-02-28',
          'audit:2026-03-01:2026-03-31',
        ].sort(),
      );

      release?.();
      const result = (await resultPromise) as CallToolResult;
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        data: {
          presentation: {
            direction: 'inflow',
            focusCategoryPrimary: 'INCOME',
          },
          current: {
            analysis: {
              startDate: '2026-03-01',
              endDate: '2026-03-31',
            },
          },
          comparison: {
            analysis: {
              startDate: '2026-02-01',
              endDate: '2026-02-28',
            },
          },
        },
      });
    } finally {
      release?.();
      await close();
    }
  });

  it('fails requested comparisons atomically and validates their exact range before loading', async () => {
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
    transactionAnalysisService.getAnalysisAudit.mockRejectedValue(
      new Error('PRIVATE_COMPARISON_FAILURE'),
    );
    const { client, close } = await connect(createServer(mockUserId));

    try {
      const invalidCurrentRange = (await client.callTool({
        name: 'visualize_cash_flow',
        arguments: {
          startDate: '2026-03-31',
          endDate: '2026-03-01',
        },
      })) as CallToolResult;
      expect(invalidCurrentRange).toMatchObject({ isError: true });

      const invalidRange = (await client.callTool({
        name: 'visualize_cash_flow',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          comparison: {
            startDate: '2026-02-28',
            endDate: '2026-02-01',
          },
        },
      })) as CallToolResult;
      expect(invalidRange).toMatchObject({ isError: true });
      expect(transactionAnalysisService.getAnalysis).not.toHaveBeenCalled();
      expect(
        transactionAnalysisService.getAnalysisAudit,
      ).not.toHaveBeenCalled();

      const failedComparison = (await client.callTool({
        name: 'visualize_cash_flow',
        arguments: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          comparison: {
            startDate: '2026-02-01',
            endDate: '2026-02-28',
          },
        },
      })) as CallToolResult;
      expect(failedComparison).toMatchObject({ isError: true });
      expect(failedComparison).not.toHaveProperty('structuredContent');
      expect(JSON.stringify(failedComparison)).not.toContain(
        'PRIVATE_COMPARISON_FAILURE',
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
    transactionAnalysisService.getAnalysisAudit.mockResolvedValue({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      neutralizationLookaroundDays: 3,
      rows: [],
    });
    mcpPortfolioVisualizationService.visualize.mockResolvedValue({
      reportingCurrency: 'USD',
      totalValueUsd: {
        amount: 125.5,
        currency: 'USD',
        sign: MoneySign.POSITIVE,
      },
      snapshotRange: { earliest: '2026-08-15', latest: '2026-08-16' },
      selectedAccountIds: [mockAccountId],
      positions: [
        {
          securityId: '33333333-3333-4333-8333-333333333333',
          securityName: 'Test Index Fund',
          tickerSymbol: 'TEST',
          type: 'equity',
          subtype: 'etf',
          quantity: '2.5',
          valueUsd: {
            amount: 125.5,
            currency: 'USD',
            sign: MoneySign.POSITIVE,
          },
          allocationBps: 10_000,
          contributions: [
            {
              accountId: mockAccountId,
              accountName: 'Test Brokerage',
              snapshotDate: '2026-08-16',
              quantity: '2.5',
              valueUsd: {
                amount: 125.5,
                currency: 'USD',
                sign: MoneySign.POSITIVE,
              },
              priceUsd: {
                amount: 45.83,
                currency: 'USD',
                sign: MoneySign.POSITIVE,
              },
            },
          ],
        },
      ],
    });
    accountsSurfaceService.getAccountsSnapshot.mockResolvedValue({
      accounts: [],
    });
    mcpReadService.listRecurringManualTransactionSchedules.mockResolvedValue({
      data: [],
      query: {},
    });
    mcpReadService.listCategories.mockResolvedValue({ data: [], query: {} });
    mcpReadService.listAnalysisRules.mockResolvedValue({
      data: [],
      query: {},
    });
    mcpReadService.listCategorizationRules.mockResolvedValue({
      data: [],
      query: {},
    });
    mcpReadService.listCategorizationRuleRecommendations.mockResolvedValue({
      data: [],
    });

    const { client, close } = await connect(createServer(mockUserId));

    try {
      const tools = await client.listTools();
      expect(
        tools.tools.find((tool) => tool.name === 'visualize_cash_flow')?._meta,
      ).toMatchObject({
        ui: {
          resourceUri: 'ui://splice/cash-flow/v3.html',
          visibility: ['model', 'app'],
        },
        'openai/outputTemplate': 'ui://splice/cash-flow/v3.html',
      });
      expect(
        tools.tools.find((tool) => tool.name === 'visualize_portfolio')?._meta,
      ).toMatchObject({
        ui: {
          resourceUri: 'ui://splice/portfolio/v3.html',
          visibility: ['model', 'app'],
        },
        'openai/outputTemplate': 'ui://splice/portfolio/v3.html',
      });

      const appCalls = [
        {
          name: 'visualize_cash_flow',
          arguments: {
            startDate: '2026-03-01',
            endDate: '2026-03-31',
          },
          app: {
            id: 'cash_flow',
            resourceUri: 'ui://splice/cash-flow/v3.html',
          },
        },
        {
          name: 'visualize_portfolio',
          arguments: { accountIds: [mockAccountId] },
          app: {
            id: 'portfolio',
            resourceUri: 'ui://splice/portfolio/v3.html',
          },
        },
      ] as const;

      for (const appCall of appCalls) {
        const result = (await client.callTool({
          name: appCall.name,
          arguments: appCall.arguments,
        })) as CallToolResult;
        expect(result.structuredContent).toMatchObject({ app: appCall.app });
        if (appCall.name === 'visualize_portfolio') {
          expect(result.structuredContent).toMatchObject({
            data: {
              reportingCurrency: 'USD',
              totalValueUsd: { amount: 125.5, currency: 'USD' },
              positions: [
                {
                  tickerSymbol: 'TEST',
                  allocationBps: 10_000,
                  contributions: [{ accountName: 'Test Brokerage' }],
                },
              ],
            },
            fallback: expect.stringContaining('complete current USD portfolio'),
          });
        }
        const text = result.content.find(
          (content): content is Extract<typeof content, { type: 'text' }> =>
            content.type === 'text',
        )?.text;
        expect(JSON.parse(text ?? '{}')).toEqual(result.structuredContent);
      }

      expect(mcpPortfolioVisualizationService.visualize).toHaveBeenCalledWith(
        mockUserId,
        [mockAccountId],
      );
      expect(mcpReadService.listInvestmentActivity).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it('enforces the Portfolio input/scope boundary and exposes only a safe atomic valuation failure', async () => {
    const withoutScope = await connect(createServer(mockUserId, []));
    try {
      const denied = (await withoutScope.client.callTool({
        name: 'visualize_portfolio',
        arguments: { accountIds: [mockAccountId] },
      })) as CallToolResult;
      expect(denied).toMatchObject({ isError: true });
      expect(mcpPortfolioVisualizationService.visualize).not.toHaveBeenCalled();
    } finally {
      await withoutScope.close();
    }

    const withScope = await connect(createServer(mockUserId, ['splice:read']));
    try {
      const invalid = (await withScope.client.callTool({
        name: 'visualize_portfolio',
        arguments: { accountIds: [] },
      })) as CallToolResult;
      expect(invalid).toMatchObject({ isError: true });
      expect(mcpPortfolioVisualizationService.visualize).not.toHaveBeenCalled();

      const invalidUuid = (await withScope.client.callTool({
        name: 'visualize_portfolio',
        arguments: { accountIds: ['not-a-uuid'] },
      })) as CallToolResult;
      expect(invalidUuid).toMatchObject({ isError: true });
      expect(invalidUuid).not.toHaveProperty('structuredContent');
      expect(mcpPortfolioVisualizationService.visualize).not.toHaveBeenCalled();

      mcpPortfolioVisualizationService.visualize.mockResolvedValue({
        reportingCurrency: 'USD',
        totalValueUsd: {
          amount: 0.001,
          currency: 'USD',
          sign: MoneySign.POSITIVE,
        },
        snapshotRange: null,
        positions: [],
      });
      const invalidCents = (await withScope.client.callTool({
        name: 'visualize_portfolio',
        arguments: {},
      })) as CallToolResult;
      expect(invalidCents).toMatchObject({ isError: true });
      expect(invalidCents).not.toHaveProperty('structuredContent');

      mcpPortfolioVisualizationService.visualize.mockRejectedValue(
        new McpPublicError(
          'portfolio_valuation_unavailable',
          'Portfolio values are temporarily unavailable.',
          { cause: new Error('PRIVATE_FX_PROVIDER_FAILURE') },
        ),
      );
      const unavailable = (await withScope.client.callTool({
        name: 'visualize_portfolio',
        arguments: { accountIds: [mockAccountId] },
      })) as CallToolResult;
      expect(unavailable).toMatchObject({ isError: true });
      expect(JSON.stringify(unavailable)).toContain(
        'Portfolio values are temporarily unavailable.',
      );
      expect(JSON.stringify(unavailable)).not.toContain(
        'PRIVATE_FX_PROVIDER_FAILURE',
      );
    } finally {
      await withScope.close();
    }
  });

  it('returns a useful ordinary fallback when the client lacks elicitation', async () => {
    const { client, close } = await connect(createServer(mockUserId));

    try {
      const result = (await client.callTool({
        name: 'collect_projection_assumptions',
        arguments: {
          suggestedHorizonDate: '2027-12-31',
        },
      })) as CallToolResult;

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        source: 'fallback',
        inputRequired: {
          action: 'unsupported',
          fields: expect.arrayContaining(['horizonDate', 'goalName']),
          suggestions: {
            horizonDate: '2027-12-31',
          },
        },
      });
    } finally {
      await close();
    }
  });

  it.each(['cancel', 'decline'] as const)(
    'returns a non-persistent ordinary fallback when projection input is %s',
    async (action) => {
      const { client, close } = await connect(createServer(mockUserId), {
        capabilities: {
          elicitation: {},
        },
      });
      client.setRequestHandler('elicitation/create', () => ({
        action,
      }));

      try {
        const result = (await client.callTool({
          name: 'collect_projection_assumptions',
          arguments: {
            suggestedHorizonDate: '2027-12-31',
          },
        })) as CallToolResult;

        expect(result.structuredContent).toMatchObject({
          source: 'fallback',
          inputRequired: expect.objectContaining({
            action,
            fields: expect.arrayContaining(['horizonDate']),
          }),
        });
        expect(mcpCategorizationService.createRule).not.toHaveBeenCalled();
        expect(mcpCategorizationService.applyRule).not.toHaveBeenCalled();
      } finally {
        await close();
      }
    },
  );

  it('collects projection assumptions with the SDK v2 resume flow', async () => {
    const { client, close } = await connect(createServer(mockUserId), {
      capabilities: {
        elicitation: {},
      },
    });
    client.setRequestHandler('elicitation/create', (request) => {
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

  it('reissues projection input after invalid accepted content', async () => {
    const { client, close } = await connect(createServer(mockUserId), {
      capabilities: {
        elicitation: {},
      },
    });
    let round = 0;
    client.setRequestHandler('elicitation/create', () => {
      round += 1;

      return round === 1
        ? {
            action: 'accept' as const,
            content: { horizonDate: 'not-a-date' },
          }
        : {
            action: 'cancel' as const,
          };
    });

    try {
      const result = (await client.callTool({
        name: 'collect_projection_assumptions',
        arguments: {},
      })) as CallToolResult;

      expect(round).toBe(2);
      expect(result.structuredContent).toMatchObject({
        source: 'fallback',
        inputRequired: expect.objectContaining({ action: 'cancel' }),
      });
    } finally {
      await close();
    }
  });
});
