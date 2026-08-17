import { createTestJwtAuthority } from '@koonweee/mcp-kit/test';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { EnabledMcpRuntimeConfig } from '../../../src/mcp/mcp.config';
import { SpliceMcpRuntimeService } from '../../../src/mcp/mcp.runtime';

const USER_ID = '00000000-0000-4000-8000-000000000099';
const LOOPBACK_HOST = '127.0.0.1';
const requestedPort = Number(process.argv[2] ?? 3102);

if (
  !Number.isInteger(requestedPort) ||
  requestedPort < 0 ||
  requestedPort > 65535
) {
  throw new Error(
    'Fixture proxy port must be an integer from 0 through 65535.',
  );
}

let upstream: URL | undefined;
let bearerToken: string | undefined;

const proxy = createServer((request, response) => {
  const origin = request.headers.origin;
  const allowedOrigin =
    typeof origin === 'string' &&
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)
      ? origin
      : undefined;

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...(allowedOrigin
        ? { 'access-control-allow-origin': allowedOrigin }
        : {}),
      'access-control-allow-headers':
        request.headers['access-control-request-headers'] ??
        'content-type,mcp-protocol-version,mcp-session-id',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-max-age': '600',
      vary: 'Origin',
    });
    response.end();
    return;
  }

  if (!upstream || !bearerToken) {
    response.writeHead(503, { 'content-type': 'text/plain' });
    response.end('Fixture MCP runtime is starting.');
    return;
  }

  const target = new URL(request.url ?? '/', upstream);
  const headers = { ...request.headers };
  headers.authorization = `Bearer ${bearerToken}`;
  headers.host = target.host;

  const upstreamRequest = httpRequest(
    target,
    { method: request.method, headers },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, {
        ...upstreamResponse.headers,
        ...(allowedOrigin
          ? { 'access-control-allow-origin': allowedOrigin }
          : {}),
        vary: 'Origin',
      });
      upstreamResponse.pipe(response);
    },
  );
  upstreamRequest.once('error', () => {
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'text/plain' });
    }
    response.end('Fixture MCP upstream unavailable.');
  });
  request.pipe(upstreamRequest);
});

async function main(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(requestedPort, LOOPBACK_HOST, resolve);
  });

  const proxyAddress = proxy.address() as AddressInfo;
  const resourceServerUrl = new URL(
    `http://${LOOPBACK_HOST}:${proxyAddress.port}/mcp`,
  );
  const authority = await createTestJwtAuthority({
    issuer: 'https://splice-mcp-fixture.invalid/',
    audience: resourceServerUrl.href,
  });

  const userService = {
    findByGoogleSubject: async () => ({ id: USER_ID }),
    findOne: async () => ({
      id: USER_ID,
      email: 'mcp-app-fixture@example.invalid',
      settings: { currency: 'USD', timezone: 'America/Los_Angeles' },
    }),
  };
  const accountsSurfaceService = {
    getAccountsSnapshot: async () => ({
      accounts: [
        {
          id: '00000000-0000-4000-8000-000000000101',
          displayName: 'Fixture Checking',
          groupingLabel: 'Cash',
          balance: { amount: 2400, currency: 'USD', sign: 'positive' },
        },
      ],
    }),
  };
  const balanceHistorySurfaceService = {
    getBalanceHistorySummary: async () => ({ data: [], query: {} }),
  };
  const transactionsSurfaceService = {
    searchTransactions: async () => ({ data: [], query: {} }),
  };
  const mcpReadService = {
    listTransactions: async () => ({ data: [], pageInfo: {}, query: {} }),
    listBalanceSnapshots: async () => ({ data: [], pageInfo: {}, query: {} }),
    listCategories: async () => ({
      data: [
        {
          id: '00000000-0000-4000-8000-000000000102',
          primary: 'FOOD_AND_DRINK',
          detailed: 'FOOD_AND_DRINK_RESTAURANT',
          label: 'Eating out',
          status: 'active',
        },
      ],
      query: { includeArchived: false },
    }),
    listInvestmentHoldings: async () => ({
      data: [
        {
          id: 'fixture-ui-holding',
          accountId: '00000000-0000-4000-8000-000000000103',
          accountName: 'Fixture Brokerage',
          quantity: '4',
          institutionPrice: '125',
          institutionValue: '500',
          isoCurrencyCode: 'USD',
          security: { name: 'Fixture Index Fund', tickerSymbol: 'FIX' },
        },
      ],
      query: { latestOnly: true },
    }),
    listInvestmentActivity: async () => ({
      data: [],
      pageInfo: { nextCursor: null, hasMore: false },
      query: {},
    }),
    listRecurringManualTransactionSchedules: async () => ({
      data: [],
      query: {},
    }),
    listAnalysisRules: async () => ({ data: [], query: { archived: false } }),
    listCategorizationRules: async () => ({
      data: [],
      query: { archived: false },
    }),
    listCategorizationRuleRecommendations: async () => ({
      suggestions: [],
    }),
  };
  const mcpCategorizationService = {
    listManualCategorizedTransactionExamples: async () => ({ data: [] }),
    listRuleCandidatePatterns: async () => ({ data: [] }),
    previewDraft: async () => ({ matched: 0 }),
    createRule: async () => ({ id: 'fixture-rule' }),
    previewRuleApplication: async () => ({ matched: 0 }),
    applyRule: async () => ({ updated: 0 }),
  };
  const transactionAnalysisService = {
    getAnalysis: async () => ({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      currency: 'USD',
      inflows: [],
      outflows: [
        {
          primaryCategory: 'FOOD_AND_DRINK',
          totalAmount: 32000,
          currency: 'USD',
          transactionCount: 3,
        },
      ],
      totalInflow: 410000,
      totalOutflow: 175000,
      netFlow: 235000,
      uncategorizedInflow: 0,
      uncategorizedOutflow: 0,
    }),
    getCategoryTransactions: async () => ({ data: [] }),
    getAnalysisAudit: async () => ({ rows: [] }),
  };
  const logger = {
    log: () => undefined,
    error: () => undefined,
  };

  const runtime = new SpliceMcpRuntimeService(
    userService as never,
    accountsSurfaceService as never,
    balanceHistorySurfaceService as never,
    transactionsSurfaceService as never,
    mcpReadService as never,
    mcpCategorizationService as never,
    transactionAnalysisService as never,
    logger as never,
  );
  const config: EnabledMcpRuntimeConfig = {
    enabled: true,
    port: 0,
    issuer: new URL(authority.issuer),
    resourceServerUrl,
    allowedHostnames: [LOOPBACK_HOST, 'localhost'],
    allowedOriginHostnames: [LOOPBACK_HOST, 'localhost'],
  };

  try {
    upstream = await runtime.start(config, {
      hostname: LOOPBACK_HOST,
      jwks: { fetch: authority.fetch },
    });
    bearerToken = await authority.sign({
      subject: 'google-oauth2|mcp-app-fixture',
      scope: 'splice:read',
    });
  } catch (error) {
    proxy.close();
    throw error;
  }

  console.log(`Fixture MCP URL: ${resourceServerUrl.href}`);
  console.log(
    'Use this URL only with the tagged official ext-apps basic-host.',
  );
  console.log('Press Ctrl+C to stop the fixture runtime.');

  async function shutdown(): Promise<void> {
    await runtime.close();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }

  process.once('SIGINT', () => {
    void shutdown().then(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void shutdown().then(() => process.exit(0));
  });
}

void main().catch((error: unknown) => {
  proxy.close();
  console.error(
    error instanceof Error ? error.message : 'Fixture startup failed.',
  );
  process.exitCode = 1;
});
