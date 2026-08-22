import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createTestJwtAuthority } from '@koonweee/mcp-kit/test';
import { ConflictException } from '@nestjs/common';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpCategorizationService } from '../../src/mcp/mcp-categorization.service';
import type { EnabledMcpRuntimeConfig } from '../../src/mcp/mcp.config';
import { SpliceMcpRuntimeService } from '../../src/mcp/mcp.runtime';
import { RuleBasedCategorizationEngine } from '../../src/transaction-categorization/rule-based-categorization.engine';
import type { CategorizationRuleCondition } from '../../src/types/CategorizationRule';

const RESOURCE_SERVER_URL = new URL('https://splice-mcp.kw0.dev/mcp');
const USER_ID = '00000000-0000-4000-8000-000000000001';

type RuntimeHarness = Awaited<ReturnType<typeof startRuntime>>;

function rawRequest(
  url: URL,
  options: {
    readonly method?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: string;
  } = {},
): Promise<{
  readonly status: number | undefined;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      url,
      { method: options.method, headers: options.headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.once('end', () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    request.once('error', reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

function clientFor(url: URL, token: string) {
  const client = new Client(
    { name: 'splice-runtime-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', url), {
    authProvider: { token: () => Promise.resolve(token) },
  });
  return { client, transport };
}

async function startRuntime(
  options: {
    readonly port?: number;
    readonly user?: object | null;
    readonly issuer?: string;
    readonly resourceServerUrl?: URL;
  } = {},
) {
  const resourceServerUrl = options.resourceServerUrl ?? RESOURCE_SERVER_URL;
  const authority = await createTestJwtAuthority({
    issuer: options.issuer ?? 'https://auth.kw0.dev/',
    audience: resourceServerUrl.href,
  });
  const userService = {
    findByGoogleSubject: jest
      .fn()
      .mockResolvedValue(options.user === null ? null : { id: USER_ID }),
    findOne: jest.fn().mockResolvedValue({
      id: USER_ID,
      email: 'user-private@example.com',
      settings: { currency: 'USD', timezone: 'America/Los_Angeles' },
    }),
  };
  const accountsSurfaceService = { getAccountsSnapshot: jest.fn() };
  const balanceHistorySurfaceService = {
    getBalanceHistorySummary: jest.fn(),
  };
  const transactionsSurfaceService = { searchTransactions: jest.fn() };
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
  const mcpPortfolioVisualizationService = { visualize: jest.fn() };
  const mcpCategorizationService = {
    listManualCategorizedTransactionExamples: jest.fn(),
    listRuleCandidatePatterns: jest.fn(),
    previewDraft: jest.fn(),
    createRule: jest.fn(),
    previewRuleApplication: jest.fn(),
    applyRule: jest.fn(),
  };
  const transactionAnalysisService = {
    getAnalysis: jest.fn(),
    getCategoryTransactions: jest.fn(),
    getAnalysisAudit: jest.fn(),
  };
  const logger = { log: jest.fn(), error: jest.fn() };
  const runtime = new SpliceMcpRuntimeService(
    userService as never,
    accountsSurfaceService as never,
    balanceHistorySurfaceService as never,
    transactionsSurfaceService as never,
    mcpReadService as never,
    mcpPortfolioVisualizationService as never,
    mcpCategorizationService as never,
    transactionAnalysisService as never,
    logger as never,
  );
  const config: EnabledMcpRuntimeConfig = {
    enabled: true,
    port: options.port ?? 0,
    issuer: new URL(authority.issuer),
    resourceServerUrl,
    allowedHostnames: ['splice-mcp.kw0.dev', '127.0.0.1'],
    allowedOriginHostnames: ['chatgpt.com', 'chat.openai.com'],
  };
  const url = await runtime.start(config, {
    hostname: '127.0.0.1',
    jwks: { fetch: authority.fetch },
  });
  if (!url) throw new Error('Expected enabled MCP runtime to start.');

  return {
    authority,
    config,
    url,
    runtime,
    logger,
    userService,
    accountsSurfaceService,
    balanceHistorySurfaceService,
    transactionsSurfaceService,
    mcpReadService,
    mcpCategorizationService,
    transactionAnalysisService,
  };
}

describe('SpliceMcpRuntimeService', () => {
  const activeRuntimes = new Set<SpliceMcpRuntimeService>();

  async function trackedRuntime(
    options: Parameters<typeof startRuntime>[0] = {},
  ): Promise<RuntimeHarness> {
    const harness = await startRuntime(options);
    activeRuntimes.add(harness.runtime);
    return harness;
  }

  afterEach(async () => {
    await Promise.all([...activeRuntimes].map((runtime) => runtime.close()));
    activeRuntimes.clear();
    jest.restoreAllMocks();
  });

  it('keeps the standalone listener opt-in and close idempotent', async () => {
    const logger = { log: jest.fn(), error: jest.fn() };
    const runtime = new SpliceMcpRuntimeService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never,
    );

    await expect(runtime.start({ enabled: false })).resolves.toBeUndefined();
    await expect(runtime.close()).resolves.toBeUndefined();
    await expect(runtime.close()).resolves.toBeUndefined();
    expect(logger.log).toHaveBeenCalledWith({}, 'MCP listener disabled');
  });

  it('initializes, lists, and executes a read through the official SDK v2 client', async () => {
    const harness = await trackedRuntime();
    const token = await harness.authority.sign({
      subject: 'google-oauth2|google-123',
      scope: 'splice:read',
    });
    const { client, transport } = clientFor(harness.url, token);

    await client.connect(transport);
    expect(client.getProtocolEra()).toBe('modern');
    expect((await client.listTools()).tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'get_user_context' }),
        expect.objectContaining({ name: 'apply_categorization_rule' }),
      ]),
    );
    const result = await client.callTool({
      name: 'get_user_context',
      arguments: { userId: 'attacker-controlled-user-id' },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      userId: USER_ID,
      email: 'user-private@example.com',
      currency: 'USD',
    });
    expect(harness.userService.findByGoogleSubject).toHaveBeenCalledWith(
      'google-123',
    );
    expect(harness.userService.findOne).toHaveBeenCalledWith(USER_ID);
    await client.close();
  });

  it('supports explicitly configured loopback HTTP issuer metadata in development', async () => {
    const harness = await trackedRuntime({
      issuer: 'http://localhost:3010/',
      resourceServerUrl: new URL('http://127.0.0.1:3001/mcp'),
    });
    const connection = clientFor(
      harness.url,
      await harness.authority.sign({
        subject: 'google-oauth2|google-123',
        scope: 'splice:read',
      }),
    );

    await connection.client.connect(connection.transport);
    expect((await connection.client.listTools()).tools.length).toBeGreaterThan(
      0,
    );
    await connection.client.close();
  });

  it.each([
    ['a missing token', undefined],
    ['a malformed token', 'not-a-jwt'],
    ['an expired token', { expiresInSeconds: -60 }],
    ['a wrong-issuer token', { issuer: 'https://wrong.example/' }],
    ['a wrong-audience token', { audience: 'https://wrong.example/mcp' }],
  ] as const)(
    'rejects %s with one sanitized exact-resource challenge',
    async (_label, tokenClaims) => {
      const harness = await trackedRuntime();
      const token =
        tokenClaims === undefined
          ? undefined
          : typeof tokenClaims === 'string'
            ? tokenClaims
            : await harness.authority.sign(tokenClaims);
      const response = await fetch(new URL('/mcp', harness.url), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'raw-test', version: '1.0.0' },
          },
        }),
      });

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe(
        `Bearer error="invalid_token", error_description="${
          token ? 'Invalid access token' : 'Missing Authorization header'
        }", resource_metadata="https://splice-mcp.kw0.dev/.well-known/oauth-protected-resource/mcp"`,
      );
      const body = await response.text();
      expect(body).not.toContain(token ?? 'no-token-value');
      expect(body).not.toContain('wrong.example');
      expect(harness.userService.findByGoogleSubject).not.toHaveBeenCalled();
    },
  );

  it('enforces read and write scopes before domain invocation', async () => {
    const harness = await trackedRuntime();
    const writeOnly = clientFor(
      harness.url,
      await harness.authority.sign({
        subject: 'google-oauth2|google-123',
        scope: 'splice:write',
      }),
    );
    await writeOnly.client.connect(writeOnly.transport);
    const deniedRead = await writeOnly.client.callTool({
      name: 'get_user_context',
      arguments: {},
    });
    expect(deniedRead).toMatchObject({ isError: true });
    expect(deniedRead.content[0]).toMatchObject({
      type: 'text',
      text: 'Insufficient scope',
    });
    expect(harness.userService.findOne).not.toHaveBeenCalled();
    await writeOnly.client.close();

    const readOnly = clientFor(
      harness.url,
      await harness.authority.sign({
        subject: 'google-oauth2|google-123',
        scope: 'splice:read',
      }),
    );
    await readOnly.client.connect(readOnly.transport);
    const deniedWrite = await readOnly.client.callTool({
      name: 'apply_categorization_rule',
      arguments: {
        ruleId: '11111111-1111-4111-8111-111111111111',
        previewToken: 'private-preview-token',
      },
    });
    expect(deniedWrite).toMatchObject({ isError: true });
    expect(deniedWrite.content[0]).toMatchObject({
      type: 'text',
      text: 'Insufficient scope',
    });
    expect(harness.mcpCategorizationService.applyRule).not.toHaveBeenCalled();
    await readOnly.client.close();
  });

  it('previews, creates, serializes, and lists the exact ChatGPT categorization rule over HTTP', async () => {
    const originalJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'mcp-runtime-categorization-test-secret';

    try {
      const harness = await trackedRuntime();
      const categoryId = '986b13a3-4c76-4b21-92a2-174ad702218e';
      const ruleId = '33333333-3333-4333-8333-333333333333';
      const conditions: CategorizationRuleCondition[] = [
        {
          field: 'providerCategoryDetailed',
          operator: 'equals',
          value: 'food_and_drink_beer_wine_and_liquor',
        },
        { field: 'amountSign', operator: 'equals', value: 'negative' },
      ];
      const rules: Array<Record<string, unknown>> = [];
      const transactionCategorizationService = {
        findOne: jest.fn(
          async (_id: string) => rules.find((rule) => rule.id === _id) ?? null,
        ),
        previewDraftRuleApplication: jest.fn().mockResolvedValue({
          matched: 4,
          updated: 4,
          skippedManual: 0,
          manualAgreement: 4,
          manualConflicts: 0,
          existingRuleOverlap: 0,
          transactions: [],
        }),
        create: jest.fn(
          async (
            _userId: string,
            input: {
              readonly name: string;
              readonly priority?: number;
              readonly targetCategoryId: string;
              readonly conditions: CategorizationRuleCondition[];
            },
          ) => {
            if (rules.length > 0) {
              throw new ConflictException(
                'An active categorization rule with the same conditions already exists',
              );
            }
            const rule = {
              id: ruleId,
              name: input.name,
              priority: input.priority ?? 10,
              targetCategoryId: input.targetCategoryId,
              conditions: input.conditions,
              targetCategory: {
                id: categoryId,
                primary: 'Food',
                detailed: 'Eating out',
                color: '#f59f00',
                archivedAt: null,
              },
              archivedAt: null,
              createdAt: new Date('2026-08-17T03:40:00.000Z'),
              updatedAt: new Date('2026-08-17T03:40:00.000Z'),
            };
            rules.push(rule);
            return rule;
          },
        ),
        previewRuleApplication: jest.fn(),
        applyRuleToExisting: jest.fn(),
      };
      const realCategorizationService = new McpCategorizationService(
        transactionCategorizationService as never,
        {} as never,
        new RuleBasedCategorizationEngine(),
      );
      harness.mcpCategorizationService.previewDraft.mockImplementation(
        realCategorizationService.previewDraft.bind(realCategorizationService),
      );
      harness.mcpCategorizationService.createRule.mockImplementation(
        realCategorizationService.createRule.bind(realCategorizationService),
      );
      harness.mcpReadService.listCategorizationRules.mockImplementation(
        async (_userId: string, input: { readonly archived?: boolean }) => ({
          data: rules,
          query: { archived: input.archived ?? false },
        }),
      );

      const connection = clientFor(
        harness.url,
        await harness.authority.sign({
          subject: 'google-oauth2|google-123',
          scope: 'splice:read splice:write',
        }),
      );
      await connection.client.connect(connection.transport);

      const discovered = await connection.client.listTools();
      expect(discovered.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'create_categorization_rule',
            annotations: expect.objectContaining({
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: false,
            }),
          }),
        ]),
      );

      const preview = await connection.client.callTool({
        name: 'preview_categorization_rule_draft',
        arguments: { targetCategoryId: categoryId, conditions },
      });
      expect(preview.isError).not.toBe(true);
      const previewContent = preview.structuredContent as {
        readonly normalizedDraft: {
          readonly targetCategoryId: string;
          readonly priority?: number;
          readonly conditions: CategorizationRuleCondition[];
        };
        readonly previewToken: string;
      };
      expect(previewContent.normalizedDraft).toEqual({
        targetCategoryId: categoryId,
        conditions,
      });
      expect(previewContent.previewToken).toEqual(expect.any(String));

      const create = await connection.client.callTool({
        name: 'create_categorization_rule',
        arguments: {
          name: 'Beer wine liquor Eating out',
          ...previewContent.normalizedDraft,
          previewToken: previewContent.previewToken,
        },
      });
      expect(create.isError).not.toBe(true);
      expect(create.structuredContent).toMatchObject({
        rule: {
          id: ruleId,
          name: 'Beer wine liquor Eating out',
          targetCategoryId: categoryId,
          conditions,
          createdAt: '2026-08-17T03:40:00.000Z',
        },
      });

      const listed = await connection.client.callTool({
        name: 'list_categorization_rules',
        arguments: {},
      });
      expect(listed.isError).not.toBe(true);
      expect(listed.structuredContent).toMatchObject({
        data: [expect.objectContaining({ id: ruleId })],
        query: { archived: false },
      });

      const duplicate = await connection.client.callTool({
        name: 'create_categorization_rule',
        arguments: {
          name: 'Beer wine liquor Eating out',
          ...previewContent.normalizedDraft,
          previewToken: previewContent.previewToken,
        },
      });
      expect(duplicate).toMatchObject({ isError: true });
      expect(duplicate.content[0]).toMatchObject({
        type: 'text',
        text: 'An active categorization rule with the same conditions already exists',
      });
      expect(rules).toHaveLength(1);
      expect(harness.logger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'tool.started',
          toolName: 'create_categorization_rule',
        }),
        'MCP tool event',
      );
      expect(harness.logger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'tool.completed',
          toolName: 'create_categorization_rule',
          outcome: 'success',
        }),
        'MCP tool event',
      );

      await connection.client.close();
    } finally {
      if (originalJwtSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = originalJwtSecret;
      }
    }
  });

  it('fails closed for unknown and malformed provider identities over HTTP', async () => {
    const unknown = await trackedRuntime({ user: null });
    const unknownClient = clientFor(
      unknown.url,
      await unknown.authority.sign({
        subject: 'google-oauth2|unknown',
        scope: 'splice:read',
      }),
    );
    await expect(
      unknownClient.client.connect(unknownClient.transport),
    ).rejects.toThrow();
    expect(unknown.userService.findByGoogleSubject).toHaveBeenCalledWith(
      'unknown',
    );
    expect(unknown.userService.findOne).not.toHaveBeenCalled();
    await unknownClient.client.close().catch(() => undefined);

    const unsupported = await trackedRuntime();
    const unsupportedClient = clientFor(
      unsupported.url,
      await unsupported.authority.sign({
        subject: 'auth0|other-provider',
        scope: 'splice:read',
      }),
    );
    await expect(
      unsupportedClient.client.connect(unsupportedClient.transport),
    ).rejects.toThrow();
    expect(unsupported.userService.findByGoogleSubject).not.toHaveBeenCalled();
    expect(unsupported.userService.findOne).not.toHaveBeenCalled();
    await unsupportedClient.client.close().catch(() => undefined);
  });

  it('publishes discovery and health while enforcing routing and request guards', async () => {
    const harness = await trackedRuntime();
    const discoveryUrl = new URL(
      '/.well-known/oauth-protected-resource/mcp',
      harness.url,
    );
    const discovery = await fetch(discoveryUrl);
    expect(discovery.status).toBe(200);
    expect(await discovery.json()).toMatchObject({
      resource: RESOURCE_SERVER_URL.href,
      authorization_servers: ['https://auth.kw0.dev/'],
      scopes_supported: ['splice:read', 'splice:write'],
      resource_name: 'Splice MCP',
    });
    expect((await fetch(new URL('/healthz', harness.url))).status).toBe(200);
    expect(
      (
        await fetch(new URL('/healthz', harness.url), {
          headers: { origin: 'https://chatgpt.com' },
        })
      ).status,
    ).toBe(200);
    expect((await fetch(new URL('/not-found', harness.url))).status).toBe(404);
    expect((await fetch(new URL('/mcp', harness.url))).status).toBe(401);

    const wrongHost = await rawRequest(new URL('/healthz', harness.url), {
      headers: { host: 'evil.example' },
    });
    expect(wrongHost.status).toBe(403);
    const canonicalHost = await rawRequest(new URL('/healthz', harness.url), {
      headers: { host: 'splice-mcp.kw0.dev' },
    });
    expect(canonicalHost.status).toBe(200);
    expect(
      (
        await fetch(new URL('/healthz', harness.url), {
          headers: { origin: 'https://evil.example' },
        })
      ).status,
    ).toBe(403);

    const unsupported = await fetch(new URL('/mcp', harness.url), {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    expect(unsupported.status).toBe(415);
    expect(await unsupported.json()).toMatchObject({
      error: {
        code: -32_000,
        message: 'Content-Type must be application/json',
      },
    });
    const invalid = await fetch(new URL('/mcp', harness.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: -32_700 } });
    const oversized = await fetch(new URL('/mcp', harness.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(1_048_576) }),
    });
    expect(oversized.status).toBe(413);

    expect((await fetch(discoveryUrl, { method: 'HEAD' })).status).toBe(200);
    expect((await fetch(discoveryUrl, { method: 'OPTIONS' })).status).toBe(204);
    const rejectedDiscoveryMutation = await fetch(discoveryUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(rejectedDiscoveryMutation.status).toBe(405);
    expect(rejectedDiscoveryMutation.headers.get('allow')).toBe(
      'GET, HEAD, OPTIONS',
    );
    expect(harness.userService.findByGoogleSubject).not.toHaveBeenCalled();

    const token = await harness.authority.sign({
      subject: 'google-oauth2|google-123',
      scope: 'splice:read',
    });
    for (const method of ['PUT', 'PATCH', 'OPTIONS']) {
      const rejectedMcpMethod = await fetch(new URL('/mcp', harness.url), {
        method,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(rejectedMcpMethod.status).toBe(405);
    }
    expect(harness.userService.findOne).not.toHaveBeenCalled();
  });

  it('recovers atomically from listener start failure and rejects duplicate start', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (blocker.address() as AddressInfo).port;
    const authority = await createTestJwtAuthority({
      issuer: 'https://auth.kw0.dev/',
      audience: RESOURCE_SERVER_URL.href,
    });
    const logger = { log: jest.fn(), error: jest.fn() };
    const runtime = new SpliceMcpRuntimeService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never,
    );
    activeRuntimes.add(runtime);
    const config: EnabledMcpRuntimeConfig = {
      enabled: true,
      port,
      issuer: new URL(authority.issuer),
      resourceServerUrl: RESOURCE_SERVER_URL,
      allowedHostnames: ['127.0.0.1'],
      allowedOriginHostnames: ['chatgpt.com'],
    };

    await expect(
      runtime.start(config, {
        hostname: '127.0.0.1',
        jwks: { fetch: authority.fetch },
      }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
    await new Promise<void>((resolve, reject) =>
      blocker.close((error) => (error ? reject(error) : resolve())),
    );
    await expect(
      runtime.start(config, {
        hostname: '127.0.0.1',
        jwks: { fetch: authority.fetch },
      }),
    ).resolves.toEqual(new URL(`http://127.0.0.1:${port}/`));
    await expect(runtime.start(config)).rejects.toThrow('already running');
  });

  it('waits for an active tool request and supports repeated close', async () => {
    const harness = await trackedRuntime();
    let release!: () => void;
    let startedResolve!: () => void;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    harness.userService.findOne.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              id: USER_ID,
              email: 'user-private@example.com',
              settings: {
                currency: 'USD',
                timezone: 'America/Los_Angeles',
              },
            });
          startedResolve();
        }),
    );
    const connection = clientFor(
      harness.url,
      await harness.authority.sign({
        subject: 'google-oauth2|google-123',
        scope: 'splice:read',
      }),
    );
    await connection.client.connect(connection.transport);
    const call = connection.client.callTool({
      name: 'get_user_context',
      arguments: {},
    });
    await started;
    let closed = false;
    const closing = harness.runtime.close().then(() => {
      closed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closed).toBe(false);
    release();
    expect((await call).isError).not.toBe(true);
    await closing;
    await expect(harness.runtime.close()).resolves.toBeUndefined();
    await connection.client.close();
  });

  it('keeps bearer tokens, tool data, results, and internal failures out of logs and errors', async () => {
    const harness = await trackedRuntime();
    const token = await harness.authority.sign({
      subject: 'google-oauth2|google-123',
      scope: 'splice:read splice:write',
    });
    const connection = clientFor(harness.url, token);
    await connection.client.connect(connection.transport);
    const success = await connection.client.callTool({
      name: 'get_user_context',
      arguments: {},
    });
    expect(success.isError).not.toBe(true);

    harness.mcpCategorizationService.applyRule.mockRejectedValueOnce(
      new Error('private write database failure'),
    );
    const writeFailure = await connection.client.callTool({
      name: 'apply_categorization_rule',
      arguments: {
        ruleId: '33333333-3333-4333-8333-333333333333',
        previewToken: 'private-preview-token',
      },
    });
    expect(writeFailure).toMatchObject({ isError: true });

    harness.userService.findOne.mockRejectedValueOnce(
      new Error('private database failure detail'),
    );
    const failure = await connection.client.callTool({
      name: 'get_user_context',
      arguments: {},
    });
    expect(failure).toMatchObject({ isError: true });
    expect(failure.content[0]).toMatchObject({
      type: 'text',
      text: 'The tool could not be completed',
    });

    const logs = JSON.stringify({
      log: harness.logger.log.mock.calls,
      error: harness.logger.error.mock.calls,
    });
    expect(logs).not.toContain(token);
    expect(logs).not.toContain('google-oauth2|google-123');
    expect(logs).not.toContain('"subject"');
    expect(logs).not.toContain('private-preview-token');
    expect(logs).not.toContain('private write database failure');
    expect(logs).not.toContain('user-private@example.com');
    expect(logs).not.toContain('private database failure detail');
    await connection.client.close();
  });
});
