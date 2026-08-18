import { createTestJwtAuthority } from '@koonweee/mcp-kit/test';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { EnabledMcpRuntimeConfig } from '../../../src/mcp/mcp.config';
import { McpPortfolioVisualizationService } from '../../../src/mcp/mcp-portfolio-visualization.service';
import { SpliceMcpRuntimeService } from '../../../src/mcp/mcp.runtime';

const USER_ID = '00000000-0000-4000-8000-000000000099';
const LOOPBACK_HOST = '127.0.0.1';
const requestedPort = Number(process.argv[2] ?? 3102);
const requestedScenario = process.argv[3] ?? 'populated';
const supportedScenarios = [
  'populated',
  'empty',
  'helper-error',
  'primary-error',
] as const;
type FixtureScenario = (typeof supportedScenarios)[number];

if (
  !Number.isInteger(requestedPort) ||
  requestedPort < 0 ||
  requestedPort > 65535
) {
  throw new Error(
    'Fixture proxy port must be an integer from 0 through 65535.',
  );
}

if (!supportedScenarios.includes(requestedScenario as FixtureScenario)) {
  throw new Error(
    `Fixture scenario must be one of: ${supportedScenarios.join(', ')}.`,
  );
}

const scenario = requestedScenario as FixtureScenario;
const hasPopulatedData = scenario !== 'empty';
const helperShouldFail = scenario === 'helper-error';
const primaryShouldFail = scenario === 'primary-error';

const COMPARISON_START_DATE = '2026-03-01';
const COMPARISON_END_DATE = '2026-03-31';

const PORTFOLIO_CASE_ACCOUNTS = {
  even: '00000000-0000-4000-8000-000000000411',
  two: '00000000-0000-4000-8000-000000000412',
  longLabels: '00000000-0000-4000-8000-000000000413',
} as const;

type PortfolioFixtureHolding = {
  id: string;
  accountId: string;
  accountName: string;
  snapshotDate: string;
  provider: string;
  securityId: string;
  securityName: string;
  tickerSymbol: string | null;
  type: string;
  subtype: string;
  quantity: string | null;
  costBasis: string | null;
  institutionPrice: string | null;
  institutionValue: {
    amount: number;
    currency: string;
    sign: 'positive';
  };
  currency: string;
  vestedQuantity: null;
  vestedValue: null;
};

function portfolioHolding(
  sequence: number,
  value: number,
  options: {
    accountId?: string;
    accountName?: string;
    currency?: string;
    date?: string;
    name?: string;
    price?: string | null;
    quantity?: string | null;
    securityId?: string;
    ticker?: string | null;
  } = {},
): PortfolioFixtureHolding {
  const currency = options.currency ?? 'USD';
  return {
    id: `00000000-0000-4000-8000-${String(500 + sequence).padStart(12, '0')}`,
    accountId: options.accountId ?? '00000000-0000-4000-8000-000000000401',
    accountName: options.accountName ?? 'Fixture Brokerage',
    snapshotDate: options.date ?? '2026-08-14',
    provider: 'fixture',
    securityId:
      options.securityId ??
      `00000000-0000-4000-8000-${String(600 + sequence).padStart(12, '0')}`,
    securityName: options.name ?? `Fixture Security ${sequence}`,
    tickerSymbol: options.ticker ?? `FX${sequence}`,
    type: 'equity',
    subtype: 'etf',
    quantity:
      options.quantity === undefined ? String(sequence * 10) : options.quantity,
    costBasis: null,
    institutionPrice:
      options.price === undefined
        ? String(value / (sequence * 10))
        : options.price,
    institutionValue: { amount: value, currency, sign: 'positive' },
    currency,
    vestedQuantity: null,
    vestedValue: null,
  };
}

function concentratedPortfolio(): PortfolioFixtureHolding[] {
  const sharedSecurityId = '00000000-0000-4000-8000-000000000601';
  return [
    portfolioHolding(1, 37_500, {
      name: 'Fixture Global Market Index',
      securityId: sharedSecurityId,
      ticker: 'GMI',
      quantity: '150',
      price: '250',
    }),
    portfolioHolding(2, 22_727.27, {
      accountId: '00000000-0000-4000-8000-000000000402',
      accountName: 'Fixture Retirement Account',
      currency: 'EUR',
      date: '2026-08-15',
      name: 'Fixture Global Market Index',
      securityId: sharedSecurityId,
      ticker: 'GMI',
      quantity: '100',
      price: '227.2727',
    }),
    portfolioHolding(3, 40_000, {
      currency: 'SGD',
      name: 'Fixture Technology Leaders Fund',
      ticker: 'TECH',
    }),
    portfolioHolding(4, 18_000, {
      name: 'Fixture Short Treasury Fund',
      ticker: 'UST',
    }),
    portfolioHolding(5, 8_000, {
      currency: 'GBP',
      date: '2026-08-13',
      name: 'Fixture Developed Markets Fund',
      ticker: 'DEV',
    }),
    portfolioHolding(6, 7_000, {
      name: 'Fixture Gold Trust',
      ticker: 'GLD',
    }),
    portfolioHolding(7, 5_000, {
      name: 'Fixture Healthcare Fund',
      ticker: 'HLTH',
    }),
    portfolioHolding(8, 4_000, {
      name: 'Fixture Small Cap Fund',
      ticker: 'SMCP',
      price: null,
    }),
    portfolioHolding(9, 3_500, {
      name: 'Fixture Cash Equivalent',
      ticker: null,
      quantity: null,
    }),
  ];
}

function evenPortfolio(): PortfolioFixtureHolding[] {
  return [14_000, 13_500, 13_000, 12_500, 12_000, 11_500, 11_000, 10_500].map(
    (value, index) =>
      portfolioHolding(index + 20, value, {
        accountId: PORTFOLIO_CASE_ACCOUNTS.even,
        accountName: 'Fixture Even Allocation Account',
        name: `Fixture Even Position ${index + 1}`,
        ticker: `EVN${index + 1}`,
      }),
  );
}

function twoPositionPortfolio(): PortfolioFixtureHolding[] {
  return [
    portfolioHolding(31, 62_000, {
      accountId: PORTFOLIO_CASE_ACCOUNTS.two,
      accountName: 'Fixture Two Position Account',
      name: 'Fixture Broad Market Fund',
      ticker: 'BROAD',
    }),
    portfolioHolding(32, 38_000, {
      accountId: PORTFOLIO_CASE_ACCOUNTS.two,
      accountName: 'Fixture Two Position Account',
      name: 'Fixture Bond Market Fund',
      ticker: 'BOND',
    }),
  ];
}

function longLabelPortfolio(): PortfolioFixtureHolding[] {
  return concentratedPortfolio().map((holding, index) => ({
    ...holding,
    accountId: PORTFOLIO_CASE_ACCOUNTS.longLabels,
    accountName:
      'Fixture International Retirement Brokerage Account With A Deliberately Long Name',
    securityName:
      index === 0
        ? 'Fixture Globally Diversified Sustainable Market Capitalization Weighted Index Fund With A Deliberately Long Name'
        : holding.securityName,
  }));
}

function portfolioFixtureFor(accountIds?: readonly string[]) {
  const selected = accountIds?.[0];
  if (selected === PORTFOLIO_CASE_ACCOUNTS.even) return evenPortfolio();
  if (selected === PORTFOLIO_CASE_ACCOUNTS.two) return twoPositionPortfolio();
  if (selected === PORTFOLIO_CASE_ACCOUNTS.longLabels) {
    return longLabelPortfolio();
  }
  return concentratedPortfolio();
}

type FixtureCategory = {
  primaryCategory: string;
  totalAmount: number;
  currency: string;
  transactionCount: number;
  color: string;
};

function fixtureCategory(
  primaryCategory: string,
  totalAmount: number,
  transactionCount: number,
  color: string,
): FixtureCategory {
  return {
    primaryCategory,
    totalAmount,
    currency: 'USD',
    transactionCount,
    color,
  };
}

const currentInflows = [
  fixtureCategory('INCOME', 600000, 2, '#16a34a'),
  fixtureCategory('INTEREST_AND_DIVIDENDS', 25000, 3, '#0d9488'),
];
const currentOutflows = [
  fixtureCategory('RENT_AND_UTILITIES', 108000, 2, '#7c3aed'),
  fixtureCategory('GROCERIES', 54000, 8, '#2563eb'),
  fixtureCategory('FOOD_AND_DRINK', 43000, 7, '#dc2626'),
  fixtureCategory('TRANSPORTATION', 31000, 5, '#0891b2'),
  fixtureCategory('BILLS_AND_SUBSCRIPTIONS', 25000, 6, '#ca8a04'),
  fixtureCategory('MEDICAL_AND_HEALTHCARE', 17000, 2, '#db2777'),
  fixtureCategory(
    'CONTINUING_EDUCATION_AND_PROFESSIONAL_DEVELOPMENT',
    12000,
    1,
    '#4f46e5',
  ),
  fixtureCategory('GIFTS_AND_DONATIONS', 7000, 2, '#ea580c'),
];
const comparisonInflows = [
  fixtureCategory('INCOME', 560000, 2, '#16a34a'),
  fixtureCategory('INTEREST_AND_DIVIDENDS', 20000, 2, '#0d9488'),
];
const comparisonOutflows = [
  fixtureCategory('RENT_AND_UTILITIES', 108000, 2, '#7c3aed'),
  fixtureCategory('GROCERIES', 68000, 10, '#2563eb'),
  fixtureCategory('FOOD_AND_DRINK', 35000, 5, '#dc2626'),
  fixtureCategory('TRANSPORTATION', 42000, 7, '#0891b2'),
  fixtureCategory('BILLS_AND_SUBSCRIPTIONS', 24000, 5, '#ca8a04'),
  fixtureCategory('TRAVEL', 32000, 2, '#14b8a6'),
  fixtureCategory('MEDICAL_AND_HEALTHCARE', 13000, 1, '#db2777'),
  fixtureCategory('GIFTS_AND_DONATIONS', 6000, 1, '#ea580c'),
];

function fixtureAnalysis(startDate: string, endDate: string) {
  if (!hasPopulatedData) {
    return {
      startDate,
      endDate,
      currency: 'USD',
      inflows: [],
      outflows: [],
      totalInflow: 0,
      totalOutflow: 0,
      netFlow: 0,
      uncategorizedInflow: 0,
      uncategorizedOutflow: 0,
    };
  }

  const isComparison =
    startDate === COMPARISON_START_DATE && endDate === COMPARISON_END_DATE;
  return {
    startDate,
    endDate,
    currency: 'USD',
    inflows: isComparison ? comparisonInflows : currentInflows,
    outflows: isComparison ? comparisonOutflows : currentOutflows,
    totalInflow: isComparison ? 580000 : 625000,
    totalOutflow: isComparison ? 340000 : 312000,
    netFlow: isComparison ? 240000 : 313000,
    uncategorizedInflow: isComparison ? 0 : 0,
    uncategorizedOutflow: isComparison ? 12000 : 15000,
  };
}

function fixtureMoney(amount: number, sign: 'positive' | 'negative') {
  return { money: { amount, currency: 'USD' }, sign };
}

function fixtureTransaction(
  id: string,
  activityDate: string,
  merchantName: string,
  amount: number,
  convertedAmount = amount,
  currency = 'USD',
) {
  return {
    id,
    activityDate,
    merchantName,
    originalDescription: `${merchantName} fixture purchase`,
    amount: {
      money: { amount, currency },
      sign: 'negative' as const,
    },
    convertedAmount: fixtureMoney(convertedAmount, 'negative'),
  };
}

const fixtureDrilldownTransactions = [
  fixtureTransaction(
    '00000000-0000-4000-8000-000000000201',
    '2026-04-28',
    'Fixture Corner Market',
    5300,
  ),
  fixtureTransaction(
    '00000000-0000-4000-8000-000000000202',
    '2026-04-03',
    'Fixture Warehouse Grocer With An Intentionally Long Merchant Name',
    12900,
  ),
  fixtureTransaction(
    '00000000-0000-4000-8000-000000000203',
    '2026-04-19',
    'Fixture Produce Stand',
    6800,
  ),
  fixtureTransaction(
    '00000000-0000-4000-8000-000000000204',
    '2026-04-11',
    'Fixture International Market',
    7200,
    8100,
    'EUR',
  ),
  fixtureTransaction(
    '00000000-0000-4000-8000-000000000205',
    '2026-04-22',
    'Fixture Neighborhood Grocery',
    5700,
  ),
  fixtureTransaction(
    '00000000-0000-4000-8000-000000000206',
    '2026-04-09',
    'Fixture Bulk Foods',
    7300,
  ),
  fixtureTransaction(
    '00000000-0000-4000-8000-000000000207',
    '2026-04-15',
    'Fixture Farm Box',
    4900,
  ),
  fixtureTransaction(
    '00000000-0000-4000-8000-000000000208',
    '2026-04-26',
    'Fixture Pantry',
    3000,
  ),
];

function fixtureAuditTransaction(
  id: string,
  activityDate: string,
  merchantName: string,
  amount: number,
  sign: 'positive' | 'negative',
) {
  return {
    id,
    activityDate,
    merchantName,
    originalDescription: `${merchantName} fixture audit transaction`,
    accountName: 'Fixture Checking',
    categoryPrimary: 'TRANSFER',
    categoryDetailed: null,
    amount: { amount, currency: 'USD', sign },
  };
}

function fixtureAuditRows(isComparison: boolean) {
  if (!hasPopulatedData) {
    return [];
  }

  const excluded = {
    id: 'fixture-audit-excluded-1',
    type: 'excluded' as const,
    groupKey: 'fixture-excluded',
    groupLabel: 'Fixture excluded transfer',
    ruleId: '00000000-0000-4000-8000-000000000301',
    ruleName: 'Fixture transfer exclusion',
    transaction: fixtureAuditTransaction(
      'fixture-audit-transaction-1',
      isComparison ? '2026-03-14' : '2026-04-14',
      'Fixture Transfer',
      50000,
      'negative',
    ),
  };
  if (isComparison) {
    return [excluded];
  }

  return [
    excluded,
    {
      ...excluded,
      id: 'fixture-audit-excluded-2',
      transaction: fixtureAuditTransaction(
        'fixture-audit-transaction-2',
        '2026-04-18',
        'Fixture Reimbursement',
        2400,
        'positive',
      ),
    },
    {
      id: 'fixture-audit-neutralized-1',
      type: 'neutralized' as const,
      groupKey: 'fixture-neutralized',
      groupLabel: 'Fixture neutralized pair',
      ruleId: '00000000-0000-4000-8000-000000000302',
      ruleName: 'Fixture transfer neutralization',
      outflow: fixtureAuditTransaction(
        'fixture-audit-transaction-3',
        '2026-04-20',
        'Fixture Account Transfer',
        125000,
        'negative',
      ),
      inflow: fixtureAuditTransaction(
        'fixture-audit-transaction-4',
        '2026-04-20',
        'Fixture Account Transfer',
        125000,
        'positive',
      ),
    },
  ];
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
      accounts: hasPopulatedData
        ? [
            {
              id: '00000000-0000-4000-8000-000000000101',
              displayName: 'Fixture Checking',
              groupingLabel: 'Cash',
              balance: { amount: 2400, currency: 'USD', sign: 'positive' },
            },
          ]
        : [],
    }),
  };
  const balanceHistorySurfaceService = {
    getBalanceHistorySummary: async () => ({ data: [], query: {} }),
  };
  const transactionsSurfaceService = {
    searchTransactions: async () => ({ data: [], query: {} }),
  };
  let investmentActivityCalls = 0;
  const mcpReadService = {
    listTransactions: async () => ({ data: [], pageInfo: {}, query: {} }),
    listBalanceSnapshots: async () => ({ data: [], pageInfo: {}, query: {} }),
    listCategories: async () => ({
      data: hasPopulatedData
        ? [
            {
              id: '00000000-0000-4000-8000-000000000102',
              primary: 'FOOD_AND_DRINK',
              detailed: 'FOOD_AND_DRINK_RESTAURANT',
              label: 'Eating out',
              status: 'active',
            },
          ]
        : [],
      query: { includeArchived: false },
    }),
    listInvestmentHoldings: async (
      _userId: string,
      options: { accountIds?: string[] },
    ) => {
      if (primaryShouldFail) {
        throw new Error('Fixture primary portfolio valuation failure.');
      }
      return {
        data: hasPopulatedData ? portfolioFixtureFor(options.accountIds) : [],
        query: {
          ...(options.accountIds ? { accountIds: options.accountIds } : {}),
          latestOnly: true,
        },
      };
    },
    listInvestmentActivity: async () => {
      investmentActivityCalls += 1;
      if (helperShouldFail && investmentActivityCalls > 1) {
        throw new Error('Fixture investment activity helper failure.');
      }
      return {
        data: [],
        pageInfo: { nextCursor: null, hasMore: false },
        query: {},
      };
    },
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
    getAnalysis: async (startDate: string, endDate: string) => {
      if (primaryShouldFail) {
        throw new Error('Fixture primary cash-flow failure.');
      }
      return fixtureAnalysis(startDate, endDate);
    },
    getCategoryTransactions: async (
      _startDate: string,
      _endDate: string,
      categoryPrimary: string,
    ) => {
      if (helperShouldFail) {
        throw new Error('Fixture cashflow drilldown helper failure.');
      }
      if (!hasPopulatedData) {
        return [];
      }
      if (categoryPrimary === 'GROCERIES') {
        return fixtureDrilldownTransactions;
      }
      if (categoryPrimary === 'UNCATEGORIZED') {
        return [
          fixtureTransaction(
            '00000000-0000-4000-8000-000000000209',
            '2026-04-16',
            'Fixture Uncategorized Merchant',
            15000,
          ),
        ];
      }
      return [
        fixtureTransaction(
          '00000000-0000-4000-8000-000000000210',
          '2026-04-12',
          `Fixture ${categoryPrimary} Merchant`,
          4300,
        ),
      ];
    },
    getAnalysisAudit: async (startDate: string, endDate: string) => {
      if (primaryShouldFail) {
        throw new Error('Fixture primary cash-flow audit failure.');
      }
      return {
        startDate,
        endDate,
        neutralizationLookaroundDays: 7,
        rows: fixtureAuditRows(
          startDate === COMPARISON_START_DATE &&
            endDate === COMPARISON_END_DATE,
        ),
      };
    },
  };
  const logger = {
    log: () => undefined,
    error: () => undefined,
  };
  const currencyConversionService = {
    getRateMap: async (currencies: string[]) => {
      const fixtureRates = new Map([
        ['EUR', 1.1],
        ['GBP', 1.25],
        ['SGD', 0.75],
      ]);
      return new Map(
        currencies.flatMap((currency) => {
          const rate = fixtureRates.get(currency);
          return rate === undefined ? [] : [[currency, rate] as const];
        }),
      );
    },
  };
  const mcpPortfolioVisualizationService = new McpPortfolioVisualizationService(
    mcpReadService as never,
    currencyConversionService as never,
  );

  const runtime = new SpliceMcpRuntimeService(
    userService as never,
    accountsSurfaceService as never,
    balanceHistorySurfaceService as never,
    transactionsSurfaceService as never,
    mcpReadService as never,
    mcpPortfolioVisualizationService,
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
  console.log(`Fixture scenario: ${scenario}`);
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
