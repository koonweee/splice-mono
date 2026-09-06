const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');
const { gzipSync } = require('node:zlib');
const { DataSource } = require('typeorm');
const { Logger } = require('@nestjs/common');

const CLOCK = '2026-09-05T12:00:00.000Z';
const FIXTURE_VERSION = 1;
const USER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const accountId = (n) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const json = (value) =>
  JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
function guardDatabase(url) {
  if (!url) throw new Error('Set BACKEND_BENCHMARK_DATABASE_URL explicitly.');
  const parsed = new URL(url);
  if (
    parsed.search ||
    parsed.hash ||
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    parsed.pathname !== '/splice_backend_benchmark'
  ) {
    throw new Error(
      'Benchmarks require a dedicated loopback database named splice_backend_benchmark.',
    );
  }
  return url;
}
function arg(args, name, fallback) {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
}
function filesUnder(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesUnder(path.join(root, entry.name))
        : [path.join(root, entry.name)],
    )
    .sort();
}
function sourceManifest(root) {
  return Object.fromEntries(
    filesUnder(path.join(root, 'src'))
      .filter((f) => /\.(ts|mjs|html|css|json)$/.test(f))
      .map((f) => [path.relative(root, f), sha(fs.readFileSync(f))]),
  );
}
function canonical(value) {
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => !['createdAt', 'updatedAt', 'completedAt'].includes(k))
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const p = (q) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)];
  return { p50: p(0.5), p95: p(0.95), min: sorted[0], max: sorted.at(-1) };
}
async function createDatabase(source, url, schema) {
  const database = new DataSource({
    type: 'postgres',
    url: guardDatabase(url),
    schema,
    entities: [path.join(source, '**/*.entity.js')],
    migrations: [path.join(source, 'migrations/*.js')],
    synchronize: false,
    logging: false,
    extra: {
      max: 10,
      options: `-c search_path=${schema},public -c timezone=UTC`,
      application_name: 'splice-backend-benchmark',
    },
  });
  await database.initialize();
  await database.query(`CREATE SCHEMA "${schema}"`);
  try {
    await database.runMigrations({ transaction: 'all' });
  } catch (error) {
    await database.query(`DROP SCHEMA "${schema}" CASCADE`);
    await database.destroy();
    throw error;
  }
  const metricsFile = path.join(source, 'observability/request-metrics.js');
  if (fs.existsSync(metricsFile)) require(metricsFile).installDatabaseMetrics(database);
  return database;
}
async function seed(database, rows) {
  await database.query(
    `INSERT INTO user_entity (id,email,"googleSubject",settings,"createdAt","updatedAt") VALUES ($1,'benchmark@example.test','benchmark-user',$3::jsonb,$4,$4),($2,'unrelated@example.test','unrelated-user',$3::jsonb,$4,$4)`,
    [
      USER,
      OTHER,
      json({
        currency: 'USD',
        timezone: 'UTC',
        neutralizationLookaroundDays: 0,
      }),
      CLOCK,
    ],
  );
  await database.query(
    `INSERT INTO account_entity (id,"userId",name,type,"subType","valuationMode","availableBalanceAmount","availableBalanceCurrency","availableBalanceSign","currentBalanceAmount","currentBalanceCurrency","currentBalanceSign","createdAt","updatedAt") SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n=999 THEN $2::uuid ELSE $1::uuid END,'Synthetic account '||n,CASE WHEN n<=100 THEN 'investment' ELSE 'depository' END,CASE WHEN n<=100 THEN 'brokerage' ELSE 'checking' END,CASE WHEN n<=100 THEN 'holdings' ELSE 'balance' END,100000,'USD','positive',100000,'USD','positive',$3::timestamp,$3::timestamp FROM generate_series(1,110) n UNION ALL SELECT $4::uuid,$2::uuid,'Unrelated','depository','checking','balance',100000,'USD','positive',100000,'USD','positive',$3::timestamp,$3::timestamp`,
    [USER, OTHER, CLOCK, accountId(999)],
  );
  await database.query(
    `INSERT INTO account_activity_entity (id,"userId","accountId",provider,"externalActivityId","activityKind","activityDate","providerDate","amountAmount","amountCurrency","amountSign","createdAt","updatedAt") SELECT md5('activity-'||n)::uuid,CASE WHEN n<=$1/10 THEN $2::uuid ELSE $3::uuid END,CASE WHEN n<=$1/10 THEN $4::uuid ELSE $5::uuid END,'plaid','synthetic-'||n,'banking_transaction',DATE '2026-09-05'-(n%365)::int,DATE '2026-09-05'-(n%365)::int,1+n%10000,'USD',CASE WHEN n%3=0 THEN 'positive' ELSE 'negative' END,$6,$6 FROM generate_series(1,$1::int) n`,
    [rows, USER, OTHER, accountId(101), accountId(999), CLOCK],
  );
  await database.query(
    `INSERT INTO banking_transaction_entity (id,"activityId",source,"merchantName",pending,"providerPayload","createdAt","updatedAt") SELECT md5('transaction-'||n)::uuid,md5('activity-'||n)::uuid,'provider','Merchant '||(n%100),n%20=0,jsonb_build_object('synthetic',repeat(md5(n::text),128)),$2,$2 FROM generate_series(1,$1::int) n`,
    [rows, CLOCK],
  );
  for (const [index, dates] of [1, 10, 100].entries()) {
    for (const currencies of [1, 3]) {
      const prefix = `fx-${dates}-${currencies}-`;
      const account = accountId(102 + index * 2 + (currencies === 3 ? 1 : 0));
      await database.query(
        `INSERT INTO account_activity_entity (id,"userId","accountId",provider,"externalActivityId","activityKind","activityDate","providerDate","amountAmount","amountCurrency","amountSign","createdAt","updatedAt") SELECT md5($1||n)::uuid,$2,$3,'plaid',$1||n,'banking_transaction',DATE '2026-09-05'-((n-1)%$4)::int,DATE '2026-09-05'-((n-1)%$4)::int,1000,CASE WHEN $5=1 THEN 'EUR' ELSE (ARRAY['EUR','GBP','JPY'])[1+(n%3)] END,'negative',$6,$6 FROM generate_series(1,100) n`,
        [prefix, USER, account, dates, currencies, CLOCK],
      );
      await database.query(
        `INSERT INTO banking_transaction_entity(id,"activityId",source,"merchantName",pending,"createdAt","updatedAt") SELECT md5('txn-'||$1||n)::uuid,md5($1||n)::uuid,'provider','Foreign synthetic',false,$2,$2 FROM generate_series(1,100) n`,
        [prefix, CLOCK],
      );
    }
  }
  await database.query(
    `INSERT INTO exchange_rate_entity (id,"baseCurrency","targetCurrency",rate,"rateDate","createdAt","updatedAt") SELECT md5(currency||d)::uuid,currency,'USD',CASE currency WHEN 'EUR' THEN 1.1 WHEN 'GBP' THEN 1.3 ELSE 0.007 END,d::date,$1,$1 FROM unnest(ARRAY['EUR','GBP','JPY']) currency CROSS JOIN generate_series(DATE '2016-01-01',DATE '2026-09-05',INTERVAL '1 month') d`,
    [CLOCK],
  );
  await database.query(
    `INSERT INTO investment_security_entity(id,"userId",provider,"externalSecurityId",name,"tickerSymbol",type,"isoCurrencyCode","createdAt","updatedAt") SELECT md5('security-'||n)::uuid,$1,'manual','security-'||n,'Synthetic security '||n,'S'||n,'equity','USD',$2,$2 FROM generate_series(1,100) n`,
    [USER, CLOCK],
  );
  const hasHeaders =
    (
      await database.query(
        "SELECT to_regclass('holdings_snapshot_header_entity') AS name",
      )
    )[0].name !== null;
  if (hasHeaders)
    await database.query(
      `INSERT INTO holdings_snapshot_header_entity(id,"userId","accountId",provider,"snapshotDate","completedAt","accountCurrency","accountValueAmount","accountValueSign","createdAt","updatedAt") SELECT md5('header-'||n)::uuid,$1,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'manual','2026-09-04',$2::timestamptz,'USD',1000000,'positive',$2::timestamp,$2::timestamp FROM generate_series(1,100)n`,
      [USER, CLOCK],
    );
  await database.query(
    `INSERT INTO investment_holding_snapshot_entity(id,"userId","accountId","securityId",provider,"snapshotDate",quantity,"institutionPrice","institutionValue","isoCurrencyCode","accountCurrency","accountValue","createdAt","updatedAt"${hasHeaders ? ',"headerId"' : ''}) SELECT md5('holding-'||a||'-'||s)::uuid,$1,('20000000-0000-4000-8000-'||lpad(a::text,12,'0'))::uuid,md5('security-'||s)::uuid,'manual','2026-09-04',10,10,100,'USD','USD',100,$2,$2${hasHeaders ? ",md5('header-'||a)::uuid" : ''} FROM generate_series(1,100) a CROSS JOIN generate_series(1,100) s`,
    [USER, CLOCK],
  );
  await database.query(
    `INSERT INTO balance_snapshot_entity(id,"userId","accountId","snapshotDate","snapshotType","currentBalanceAmount","currentBalanceCurrency","currentBalanceSign","availableBalanceAmount","availableBalanceCurrency","availableBalanceSign","createdAt","updatedAt") SELECT md5('balance-'||a||d)::uuid,$1,('20000000-0000-4000-8000-'||lpad(a::text,12,'0'))::uuid,d::date,'USER_UPDATE',100000+a*100,'USD','positive',100000+a*100,'USD','positive',$2,$2 FROM generate_series(1,100) a CROSS JOIN generate_series(DATE '2016-09-01',DATE '2026-09-01',INTERVAL '1 month') d`,
    [USER, CLOCK],
  );
  await database.query('ANALYZE');
}
function instrument(database, options = {}) {
  const original = database.createQueryRunner.bind(database);
  let current = [];
  let recording = true;
  let poolWaits = [];
  const obtain = database.driver.obtainMasterConnection.bind(database.driver);
  database.driver.obtainMasterConnection = async (...args) => {
    const start = performance.now();
    const connection = await obtain(...args);
    if (recording) poolWaits.push(performance.now() - start);
    return connection;
  };
  database.createQueryRunner = (...args) => {
    const runner = original(...args);
    const query = runner.query.bind(runner);
    runner.query = async (sql, parameters, ...rest) => {
      const start = performance.now();
      try {
        const result = await query(sql, parameters, ...rest);
        const records = Array.isArray(result) ? result : result?.records;
        if (recording)
          current.push(
            options.aggregate
              ? {
                  sql: sql.trimStart().split(/\s+/).slice(0, 2).join(' '),
                  ms: performance.now() - start,
                  rows: records?.length ?? 0,
                }
              : {
                  sql,
                  parameters,
                  ms: performance.now() - start,
                  rows: records?.length ?? 0,
                  records,
                },
          );
        return result;
      } catch (error) {
        if (recording)
          current.push({
            sql,
            parameters,
            ms: performance.now() - start,
            error: true,
          });
        throw error;
      }
    };
    return runner;
  };
  return {
    reset() {
      recording = true;
      current = [];
      poolWaits = [];
    },
    pause() {
      recording = false;
      current = [];
      poolWaits = [];
    },
    get() {
      return current;
    },
    getPoolWaits() {
      return poolWaits;
    },
  };
}
function makeServices(database, source) {
  const load = createRequire(path.join(source, 'entry.js'));
  const cls = (file, name) => load(`./${file}.js`)[name];
  const entity = (file, name) => database.getRepository(cls(file, name));
  const repo = {
    users: entity('user/user.entity', 'UserEntity'),
    accounts: entity('account/account.entity', 'AccountEntity'),
    links: entity('bank-link/bank-link.entity', 'BankLinkEntity'),
    snapshots: entity(
      'balance-snapshot/balance-snapshot.entity',
      'BalanceSnapshotEntity',
    ),
    transactions: entity('transaction/transaction.entity', 'TransactionEntity'),
    categories: entity('category/category.entity', 'CategoryEntity'),
    rates: entity(
      'currency-exchange/exchange-rate.entity',
      'ExchangeRateEntity',
    ),
    holdings: entity(
      'investment/investment-holding-snapshot.entity',
      'InvestmentHoldingSnapshotEntity',
    ),
    securities: entity(
      'investment/investment-security.entity',
      'InvestmentSecurityEntity',
    ),
    investmentTransactions: entity(
      'investment/investment-transaction.entity',
      'InvestmentTransactionEntity',
    ),
    rules: entity('analysis-rule/analysis-rule.entity', 'AnalysisRuleEntity'),
    categorizationRules: entity(
      'transaction-categorization/categorization-rule.entity',
      'CategorizationRuleEntity',
    ),
    activities: entity(
      'account-activity/account-activity.entity',
      'AccountActivityEntity',
    ),
    tokens: entity(
      'auth/personal-access-token.entity',
      'PersonalAccessTokenEntity',
    ),
  };
  const forbidden = new Proxy(
    {},
    {
      get: (_, key) => () => {
        throw new Error(
          `External dependency ${String(key)} forbidden in benchmark`,
        );
      },
    },
  );
  const events = new (require('eventemitter2').EventEmitter2)();
  const user = new (cls('user/user.service', 'UserService'))(
    repo.users,
    forbidden,
    events,
  );
  const exchange = new (cls(
    'currency-exchange/currency-exchange.service',
    'CurrencyExchangeService',
  ))(repo.rates, forbidden, forbidden);
  const conversion = new (cls(
    'currency-exchange/currency-conversion.service',
    'CurrencyConversionService',
  ))(exchange, user);
  const accounts = new (cls('account/account.service', 'AccountService'))(
    repo.accounts,
    repo.snapshots,
    repo.links,
    events,
    user,
  );
  const rules = new (cls(
    'analysis-rule/analysis-rule.service',
    'AnalysisRuleService',
  ))(repo.rules, repo.categories);
  const categories = new (cls('category/category.service', 'CategoryService'))(
    repo.categories,
    repo.transactions,
  );
  const engine = new (cls(
    'transaction-categorization/rule-based-categorization.engine',
    'RuleBasedCategorizationEngine',
  ))();
  const categorization = new (cls(
    'transaction-categorization/categorization-rule.service',
    'TransactionCategorizationService',
  ))(
    repo.categorizationRules,
    repo.accounts,
    repo.categories,
    repo.transactions,
    engine,
  );
  const transactionQuery = fs.existsSync(
    path.join(source, 'transaction/transaction-query.service.js'),
  )
    ? new (cls(
        'transaction/transaction-query.service',
        'TransactionQueryService',
      ))(repo.transactions)
    : null;
  const transaction = new (cls(
    'transaction/transaction.service',
    'TransactionService',
  ))(
    repo.transactions,
    repo.categories,
    repo.accounts,
    categories,
    categorization,
    events,
    transactionQuery ?? undefined,
  );
  const cashflow = fs.existsSync(
    path.join(source, 'transaction-analysis/cash-flow-query.service.js'),
  )
    ? new (cls(
        'transaction-analysis/cash-flow-query.service',
        'CashFlowQueryService',
      ))(database, transactionQuery, conversion, rules)
    : null;
  const analysis = cashflow
    ? new (cls(
        'transaction-analysis/transaction-analysis.service',
        'TransactionAnalysisService',
      ))(cashflow)
    : new (cls(
        'transaction-analysis/transaction-analysis.service',
        'TransactionAnalysisService',
      ))(repo.transactions, conversion, rules, user);
  const matcher = cashflow
    ? new (cls(
        'transaction-analysis/cash-flow-rules',
        'CashFlowRuleEvaluator',
      ))(rules)
    : analysis;
  const report = async (start, end) => {
    if (analysis.getReport) {
      const value = await analysis.getReport(start, end, USER);
      return { summary: value.summary, audit: value.audit };
    }
    return {
      summary: await analysis.getAnalysis(start, end, USER),
      audit: await analysis.getAnalysisAudit(start, end, USER),
    };
  };
  const balance = new (cls(
    'balance-query/balance-query.service',
    'BalanceQueryService',
  ))(repo.accounts, repo.snapshots, exchange, user);
  const dashboard = new (cls(
    'balance-query/dashboard-query.service',
    'DashboardQueryService',
  ))(balance);
  const history = new (cls(
    'balance-query/balance-history-surface.service',
    'BalanceHistorySurfaceService',
  ))(balance);
  const surface = new (cls(
    'transaction/transactions-surface.service',
    'TransactionsSurfaceService',
  ))(transaction);
  const holdingsQuery = fs.existsSync(
    path.join(source, 'investment/holdings-query.service.js'),
  )
    ? new (cls('investment/holdings-query.service', 'HoldingsQueryService'))(
        database,
      )
    : null;
  const read = new (cls('mcp/mcp-read.service', 'McpReadService'))(
    repo.transactions,
    repo.snapshots,
    repo.categories,
    holdingsQuery ?? repo.holdings,
    repo.investmentTransactions,
    conversion,
    accounts,
    forbidden,
    rules,
    categorization,
    forbidden,
    transactionQuery ?? undefined,
  );
  const investment = holdingsQuery
    ? new (cls('investment/investment.service', 'InvestmentService'))(
        repo.securities,
        repo.holdings,
        repo.investmentTransactions,
        repo.accounts,
        database,
        holdingsQuery,
      )
    : new (cls('investment/investment.service', 'InvestmentService'))(
        repo.securities,
        repo.holdings,
        repo.investmentTransactions,
        repo.accounts,
        repo.snapshots,
        new (cls(
          'account-activity/account-activity.service',
          'AccountActivityService',
        ))(repo.activities, repo.accounts),
      );
  const portfolio = new (cls(
    'mcp/mcp-portfolio-visualization.service',
    'McpPortfolioVisualizationService',
  ))(read, conversion);
  const pat = new (cls(
    'auth/personal-access-token.service',
    'PersonalAccessTokenService',
  ))(repo.tokens, repo.users);
  const stringMoney = cls('types/MoneyWithSign', 'MoneySchema').safeParse({
    amount: '1',
    currency: 'USD',
  }).success;
  return {
    database,
    applicationMetrics: fs.existsSync(path.join(source, 'observability/request-metrics.module.js')),
    portfolio,
    transactionQuery,
    cashflow,
    matcher,
    report,
    holdingsQuery,
    pat,
    stringMoney,
    load,
    cls,
    repo,
    user,
    exchange,
    conversion,
    accounts,
    rules,
    categories,
    categorization,
    transaction,
    analysis,
    balance,
    dashboard,
    history,
    surface,
    read,
    investment,
    forbidden,
  };
}
async function transports(s) {
  const { Test } = require('@nestjs/testing');
  const controller = s.cls(
    'transaction/transaction.controller',
    'TransactionController',
  );
  class BenchmarkDatabaseModule {}
  const module = await Test.createTestingModule({
    imports: s.applicationMetrics ? [
      { module: BenchmarkDatabaseModule, global: true, providers: [{ provide: DataSource, useValue: s.database }], exports: [DataSource] },
      s.cls('observability/request-metrics.module', 'RequestMetricsModule'),
    ] : [],
    controllers: [controller],
    providers: [
      {
        provide: s.cls('transaction/transaction.service', 'TransactionService'),
        useValue: s.transaction,
      },
      {
        provide: s.cls(
          'currency-exchange/currency-conversion.service',
          'CurrencyConversionService',
        ),
        useValue: s.conversion,
      },
      ...(s.transactionQuery ? [{ provide: s.cls('transaction/transaction-query.service', 'TransactionQueryService'), useValue: s.transactionQuery }] : []),
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  const pat = await s.pat.createToken(
    { userId: USER, email: 'benchmark@example.test' },
    { name: 'Synthetic benchmark token' },
  );
  app.useGlobalGuards(
    new (s.cls('auth/guards/jwt-auth.guard', 'JwtAuthGuard'))(
      new (require('@nestjs/core').Reflector)(),
      s.pat,
    ),
  );
  await app.listen(0, '127.0.0.1');
  const httpUrl = await app.getUrl();
  const { createTestJwtAuthority } = require('@koonweee/mcp-kit/test');
  const authority = await createTestJwtAuthority({
    issuer: 'https://benchmark.example.test/',
    audience: 'https://splice-mcp.kw0.dev/mcp',
  });
  const Runtime = s.cls('mcp/mcp.runtime', 'SpliceMcpRuntimeService');
  const runtime = new Runtime(
    s.user,
    s.forbidden,
    s.history,
    s.surface,
    s.read,
    s.portfolio,
    s.forbidden,
    s.analysis,
    { log() {}, error() {} },
  );
  const url = await runtime.start(
    {
      enabled: true,
      port: 0,
      issuer: new URL(authority.issuer),
      resourceServerUrl: new URL('https://splice-mcp.kw0.dev/mcp'),
      allowedHostnames: ['splice-mcp.kw0.dev', '127.0.0.1'],
      allowedOriginHostnames: [],
    },
    { hostname: '127.0.0.1', jwks: { fetch: authority.fetch } },
  );
  const token = await authority.sign({
    subject: 'google-oauth2|benchmark-user',
    scope: 'splice:read',
  });
  const {
    Client,
    StreamableHTTPClientTransport,
  } = require('@modelcontextprotocol/client');
  const client = new Client(
    { name: 'splice-backend-benchmark', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  const start = performance.now();
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', url), {
      authProvider: { token: () => Promise.resolve(token) },
    }),
  );
  const handshakeMs = performance.now() - start;
  return {
    handshakeMs,
    async http(query) {
      const response = await fetch(
        `${httpUrl}/transaction?${new URLSearchParams(query)}`,
        { headers: { authorization: `Bearer ${pat.token}` } },
      );
      if (!response.ok)
        throw new Error(`HTTP benchmark status ${response.status}`);
      return response.json();
    },
    async mcp(name, args) {
      const result = await client.callTool({ name, arguments: args });
      if (result.isError) throw new Error(`MCP ${name}: ${json(result)}`);
      return result;
    },
    async close() {
      await client.close();
      await runtime.close();
      await app.close();
    },
  };
}
function workloads(s, t, rows, full) {
  const cases = [];
  const TransactionEntity = s.cls(
    'transaction/transaction.entity',
    'TransactionEntity',
  );
  for (const count of [500, 1000, 2000]) {
    const matching = Array.from({ length: count }, (_, i) => {
      const row = TransactionEntity.fromDto(
        {
          accountId: accountId(101),
          amount: {
            money: { currency: 'USD', amount: s.stringMoney ? '1000' : 1000 },
            sign: i % 2 ? 'positive' : 'negative',
          },
          providerDate: i % 2 ? '2026-09-02' : '2026-09-01',
          merchantName: 'Synthetic matching',
          pending: false,
        },
        USER,
      );
      row.id = `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      return row;
    });
    cases.push({
      name: `matching.${count}-equal-amount-rows`,
      layer: 'service-cpu',
      policy: 'equivalent',
      call: () => {
        const result = s.matcher.neutralizeTransactions(matching);
        return {
          pairs: result.pairs.map((p) => [p.outflow.id, p.inflow.id]),
          remaining: result.unmatchedTransactions.map((t) => t.id),
        };
      },
    });
  }
  const add = (name, layer, call, policy = 'equivalent') =>
    cases.push({ name, layer, call, policy });
  for (const sortBy of ['activityDate', 'amount', 'merchantName', 'pending'])
    for (const pageIndex of [0, Math.max(0, Math.floor(rows / 10 / 50) - 2)])
      add(`transactions.${sortBy}.page-${pageIndex}`, 'service+postgres', () =>
        s.transaction.findAllPaginated(USER, {
          pageIndex,
          pageSize: 50,
          sortBy,
          sortOrder: 'DESC',
          accountId: accountId(101),
        }),
      );
  add('transactions.date-filter', 'service+postgres', () =>
    s.transaction.findAllPaginated(USER, {
      pageIndex: 0,
      pageSize: 50,
      startDate: '2026-08-01',
      endDate: '2026-09-05',
    }),
  );
  add('transactions.search', 'service+postgres', () =>
    s.surface.searchTransactions(USER, {
      merchantQuery: 'Merchant',
      limit: 20,
    }),
  );
  for (const [index, dates] of [1, 10, 100].entries())
    for (const currencies of [1, 3])
      add(
        `mcp-transactions.fx-${dates}-dates-${currencies}-currencies`,
        'service+postgres',
        () =>
          s.read.listTransactions(USER, {
            accountIds: [
              accountId(102 + index * 2 + (currencies === 3 ? 1 : 0)),
            ],
            pageSize: 100,
            reportingCurrency: 'USD',
          }),
        'date-fx-policy',
      );
  for (const accounts of [1, 20, 100])
    add(`holdings.${accounts}-accounts-100-positions`, 'service+postgres', () =>
      s.read.listInvestmentHoldings(USER, {
        accountIds: Array.from({ length: accounts }, (_, i) =>
          accountId(i + 1),
        ),
      }),
    );
  for (const [name, startDate] of [
    ['month', '2026-08-06'],
    ['year', '2025-09-05'],
    ['ten-years', '2016-09-07'],
  ])
    for (const accounts of full ? [20, 100] : [20])
      add(
        `history.${name}.${accounts}-accounts.daily`,
        'service+postgres',
        () =>
          s.history.getBalanceHistorySummary(USER, {
            startDate,
            endDate: '2026-09-05',
            accountIds: Array.from({ length: accounts }, (_, i) =>
              accountId(i + 1),
            ),
          }),
      );
  add(
    'cashflow.month.summary-audit',
    'service+postgres',
    () => s.report('2026-08-06', '2026-09-05'),
    'row-rounding-policy',
  );
  add(
    'cashflow.year.summary-audit',
    'service+postgres',
    () => s.report('2025-09-05', '2026-09-05'),
    'row-rounding-policy',
  );
  if (t) {
    add(
      'http.transactions.convert',
      'http-controller+pat-auth+postgres',
      () => t.http({ pageSize: '100', convert: 'true' }),
      'date-fx-policy',
    );
    add(
      'mcp.transport.transactions.fx-100',
      'mcp-auth0-test-authority+postgres',
      () =>
        t.mcp('list_transactions', {
          accountIds: [accountId(106)],
          pageSize: 100,
          reportingCurrency: 'USD',
        }),
      'date-fx-policy',
    );
    add('mcp.transport.holdings-20', 'mcp-auth0-test-authority+postgres', () =>
      t.mcp('list_investment_holdings', {
        accountIds: Array.from({ length: 20 }, (_, i) => accountId(i + 1)),
      }),
    );
    add(
      'mcp.transport.cashflow-comparison',
      'mcp-auth0-test-authority+postgres',
      () =>
        t.mcp('visualize_cash_flow', {
          startDate: '2026-08-06',
          endDate: '2026-09-05',
          comparison: { startDate: '2026-07-06', endDate: '2026-08-05' },
        }),
      'row-rounding-policy',
    );
    add(
      'mcp.transport.history-month',
      'mcp-auth0-test-authority+postgres',
      () =>
        t.mcp('get_balance_history', {
          startDate: '2026-08-06',
          endDate: '2026-09-05',
          accountIds: Array.from({ length: 20 }, (_, i) => accountId(i + 1)),
        }),
    );
  }
  return cases;
}
async function capture(args) {
  const variant = arg(args, 'variant', 'before');
  if (!['before', 'after'].includes(variant))
    throw new Error('Variant must be before or after');
  const root = path.resolve(process.env.BENCHMARK_SOURCE_ROOT || process.cwd());
  const source = path.join(root, '.benchmark-build', 'src');
  const buildRoot = fs.existsSync(source)
    ? source
    : path.join(root, '.benchmark-build');
  if (
    !fs.existsSync(path.join(buildRoot, 'transaction/transaction.service.js'))
  )
    throw new Error(
      'Compile selected source with tsc -p tsconfig.build.json --outDir .benchmark-build --incremental false first.',
    );
  require('tsconfig-paths').register({
    baseUrl: buildRoot,
    paths: { 'src/*': ['*'], '@/*': ['*'] },
  });
  process.env.DISABLE_SCHEDULES = 'true';
  delete process.env.SEQ_SERVER_URL;
  delete process.env.SEQ_API_KEY;
  Logger.overrideLogger(false);
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [CLOCK]));
    }
    static now() {
      return RealDate.parse(CLOCK);
    }
  };
  const rows = Number(arg(args, 'rows', '10000')),
    samples = Number(arg(args, 'samples', '100')),
    warmups = Number(arg(args, 'warmups', '5')),
    runId = Number(arg(args, 'run', '1'));
  if (
    ![10000, 100000, 1000000].includes(rows) ||
    !Number.isInteger(samples) ||
    samples < 1 ||
    samples > 10000 ||
    !Number.isInteger(warmups) ||
    warmups < 0 ||
    warmups > 100 ||
    !Number.isInteger(runId) ||
    runId < 1
  )
    throw new Error('Invalid rows/samples');
  const schema = `backend_bench_${variant.replace(/[^a-z]/g, '')}_${crypto.randomUUID().replaceAll('-', '')}`;
  const output = path.resolve(
    arg(
      args,
      'output',
      path.join(__dirname, '../../docs/performance/backend-query'),
    ),
  );
  fs.mkdirSync(output, { recursive: true });
  const database = await createDatabase(
    buildRoot,
    process.env.BACKEND_BENCHMARK_DATABASE_URL,
    schema,
  );
  let transport;
  let activeMemoryObserver;
  const fixture = {
    version: FIXTURE_VERSION,
    rows,
    targetRows: rows / 10,
    clock: CLOCK,
    seedHash: sha(seed.toString()),
  };
  const sourceFiles = sourceManifest(root);
  const report = {
    variant,
    run: runId,
    fixture,
    fixtureHash: sha(json(fixture)),
    environment: {
      node: process.version,
      postgres: (await database.query('SELECT version() version'))[0].version,
      cpu: os.cpus()[0].model,
      cpuCount: os.cpus().length,
      poolMax: 10,
      buildMode: 'tsc production emit; no ts-node in measured application code',
      instrumentation:
        'v2: measured intervals only; per-row SQL byte serialization after interval',
      heapLimitBytes: require('node:v8').getHeapStatistics().heap_size_limit,
      clock: CLOCK,
      cache:
        'database-warm after deterministic seed; repeated requests; no host cache flush',
    },
    source: { files: sourceFiles, hash: sha(json(sourceFiles)) },
    implementation: { applicationDatabaseMetrics: fs.existsSync(path.join(buildRoot, 'observability/request-metrics.js')), httpRequestMetrics: fs.existsSync(path.join(buildRoot, 'observability/request-metrics.module.js')) },
    provenance: require('./provenance.cjs').captureProvenance(root, args.includes('--memory') ? 'memory' : args.includes('--auth-settings') ? 'auth-settings' : args.includes('--filters') ? 'filters' : args.includes('--sync') ? 'sync' : args.includes('--shape') ? 'shape' : args.includes('--extended') ? 'extended' : 'main'),
    harness: {
      files: Object.fromEntries(
        filesUnder(__dirname)
          .filter((f) => f.endsWith('.cjs'))
          .map((f) => [path.basename(f), sha(fs.readFileSync(f))]),
      ),
    },
    samples,
    warmups,
    scenarios: [],
    plans: {},
    schema: {},
    handshakeMs: null,
  };
  const filename = path.join(output, `${variant}-${rows}-run${runId}.json`);
  try {
    console.log(
      `Seeding ${rows} synthetic transaction rows in an owned benchmark schema`,
    );
    await seed(database, rows);
    report.schema.fixtureAdapter = await require('./schema-fixture-adapter.cjs').applySchemaFixtureAdapter(database);
    report.schema.indexes = await database.query(
      'SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=$1 ORDER BY tablename,indexname',
      [schema],
    );
    report.schema.columns = await database.query(
      'SELECT table_name,column_name,data_type,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema=$1 ORDER BY table_name,ordinal_position',
      [schema],
    );
    report.schema.migrations = await database.query(
      `SELECT name,timestamp FROM "${schema}".migrations ORDER BY id`,
    );
    const recorder = instrument(database),
      s = makeServices(database, buildRoot);
    recorder.pause();
    if (args.includes('--correctness')) {
      report.correctness =
        await require('./correctness-probes.cjs').correctnessProbes(
          database,
          s,
        );
      fs.writeFileSync(filename, json(report) + '\n');
      if (variant === 'after')
        require('./correctness-probes.cjs').validateCorrectness(
          report.correctness,
        );
      report.edgeCorrectness = await require('./edge-correctness-probes.cjs').runEdgeCorrectness(database, s);
      if (variant === 'after') require('./edge-correctness-probes.cjs').validateEdgeCorrectness(report.edgeCorrectness);
    }
    if (!args.includes('--no-transports')) {
      transport = await transports(s);
      report.handshakeMs = transport.handshakeMs;
    }
    const filter = arg(args, 'filter', '');
    const selectedWorkloads = workloads(
      s,
      transport,
      rows,
      args.includes('--full'),
    );
    if (args.includes('--extended'))
      selectedWorkloads.push(
        ...require('./extended-workloads.cjs').extendedWorkloads(database, s, rows),
      );
    if (args.includes('--shape'))
      selectedWorkloads.push(
        ...require('./shape-workloads.cjs').shapeWorkloads(database, s),
      );
    if (args.includes('--sync'))
      selectedWorkloads.push(
        ...require('./sync-workloads.cjs').syncWorkloads(database, s),
      );
    if (args.includes('--filters'))
      selectedWorkloads.push(
        ...require('./filter-workloads.cjs').filterWorkloads(database, s),
      );
    if (args.includes('--auth-settings'))
      selectedWorkloads.push(
        ...require('./auth-settings-workloads.cjs').authSettingsWorkloads(database, s),
      );
    require('./amount-page-oracle.cjs').attachAmountPageOracles(selectedWorkloads, database, s, rows);
    for (const workload of selectedWorkloads.filter(
      (w) => !filter || w.name.includes(filter),
    )) {
      console.log(`Measuring ${workload.name}`);
      if (args.includes('--memory') && global.gc) global.gc();
      const memoryBaseline = args.includes('--memory')
        ? process.memoryUsage()
        : undefined;
      const memoryObserver = args.includes('--memory')
        ? await require('./memory-observer.cjs').startMemoryObserver()
        : undefined;
      activeMemoryObserver = memoryObserver;
      try {
        if (workload.setup) await workload.setup();
        await workload.call();
      } catch (error) {
        const knownFailure =
          (/^(transactions|extended\.cursor)\.amount\./.test(workload.name) &&
            error.message.includes('databaseName')) ||
          (/^sync\.banking(?:-modified)?\.5000\./.test(workload.name) &&
            error.message.includes('parameter'));
        if (variant !== 'before' || !knownFailure) throw error;
        if (memoryObserver) await memoryObserver.stop();
        activeMemoryObserver = undefined;
        report.scenarios.push({
          name: workload.name,
          layer: workload.layer,
          policy: workload.policy,
          baselineFailure: error.message,
        });
        fs.writeFileSync(filename, json(report) + '\n');
        continue;
      }
      for (let i = 0; i < warmups; i++) {
        if (workload.setup) await workload.setup();
        await workload.call();
      }
      const raw = [];
      let firstStatements = [];
      let digest;
      let outputArtifact;
      let validation;
      for (let i = 0; i < samples; i++) {
        if (workload.setup) await workload.setup();
        recorder.reset();
        const cpu = process.cpuUsage(),
          heap = process.memoryUsage().heapUsed,
          start = performance.now();
        const result = await workload.call();
        const serializationStart = performance.now();
        const body = json(result),
          serializationMs = performance.now() - serializationStart,
          elapsed = performance.now() - start,
          usage = process.cpuUsage(cpu),
          memoryAtEnd = process.memoryUsage(),
          statements = recorder.get(),
          poolWaits = recorder.getPoolWaits();
        recorder.pause();
        for (const statement of statements) {
          statement.bytes = statement.records
            ? 2 +
              statement.records.reduce(
                (bytes, row, index) =>
                  bytes + Buffer.byteLength(json(row)) + (index ? 1 : 0),
                0,
              )
            : 0;
          delete statement.records;
        }
        if (i === 0) {
          firstStatements = statements;
          digest = sha(json(canonical(result)));
          outputArtifact = `${variant}-${rows}-run${runId}-${workload.name}.output.json.gz`;
          fs.writeFileSync(path.join(output, outputArtifact), gzipSync(body));
        }
        const selects = statements.filter((q) =>
          /^(SELECT|WITH)\b/i.test(q.sql.trimStart()),
        );
        raw.push({
          ms: elapsed,
          serializationMs,
          poolWaitMs: poolWaits.reduce((sum, wait) => sum + wait, 0),
          poolAcquisitions: poolWaits.length,
          cpuMs: (usage.user + usage.system) / 1000,
          heapDelta: memoryAtEnd.heapUsed - heap,
          rss: memoryAtEnd.rss,
          sqlCount: selects.length,
          fxSelects: selects.filter((query) => /\bexchange_rate_entity\b/i.test(query.sql)).length,
          categorizationRuleSelects: selects.filter((query) => /\bcategorization_rule_entity\b/i.test(query.sql)).length,
          sqlWriteCount: statements.filter((q) =>
            /^(INSERT|UPDATE|DELETE)\b/i.test(q.sql.trimStart()),
          ).length,
          dataModifyingStatements: statements.filter((q) => /^(INSERT|UPDATE|DELETE)\b/i.test(q.sql.trimStart()) || (/^WITH\b/i.test(q.sql.trimStart()) && /\b(INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM)\b/i.test(q.sql))).length,
          transactionStatements: statements.filter((q) =>
            /^(START TRANSACTION|BEGIN|COMMIT|ROLLBACK)\b/i.test(
              q.sql.trimStart(),
            ),
          ).length,
          sqlMs: selects.reduce((n, q) => n + q.ms, 0),
          totalDataSqlMs: statements.filter(q => /^(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(q.sql.trimStart())).reduce((sum, q) => sum + q.ms, 0),
          topLevelWriteSqlMs: statements.filter(q => /^(INSERT|UPDATE|DELETE)\b/i.test(q.sql.trimStart())).reduce((sum, q) => sum + q.ms, 0),
          sqlRows: selects.reduce((n, q) => n + q.rows, 0),
          sqlBytes: selects.reduce((n, q) => n + q.bytes, 0),
          responseBytes: Buffer.byteLength(body),
          gzipBytes: gzipSync(body).length,
        });
        if (i === 0 && workload.verify) {
          validation = await workload.verify(result);
        }
      }
      const isolatedMemory = memoryObserver
        ? {
            baseline: memoryBaseline,
            forcedGcBeforeScenario: typeof global.gc === 'function',
            ...(await memoryObserver.stop()),
            scope:
              'Isolated scenario process; RSS sampled during preflight, warmups, measured calls and first-call verification; excludes seeding. Worker overhead included.',
          }
        : undefined;
      activeMemoryObserver = undefined;
      report.scenarios.push({
        name: workload.name,
        layer: workload.layer,
        policy: workload.policy,
        isolatedMemory,
        outputDigest: digest,
        outputArtifact,
        validation,
        latencyMs: stats(raw.map((r) => r.ms)),
        cpuMs: stats(raw.map((r) => r.cpuMs)),
        raw,
      });
      const unique = new Map();
      for (const q of firstStatements.filter((q) =>
        /^(SELECT|WITH)\b/i.test(q.sql.trimStart()),
      ))
        if (!unique.has(q.sql)) unique.set(q.sql, q);
      report.plans[workload.name] = [];
      for (const q of [...unique.values()].slice(0, 8)) {
        const plan = await database.query(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.sql}`,
          q.parameters,
        );
        report.plans[workload.name].push({
          sql: q.sql.replaceAll(schema, '<owned-schema>'),
          parameters: q.parameters,
          observedRows: q.rows,
          observedBytes: q.bytes,
          plan,
        });
      }
      fs.writeFileSync(filename, json(report) + '\n');
    }
    report.completed = true;
    fs.writeFileSync(filename, json(report) + '\n');
    console.log(`Saved ${filename}`);
  } finally {
    if (activeMemoryObserver) await activeMemoryObserver.stop();
    if (transport) await transport.close();
    await database.query(`DROP SCHEMA "${schema}" CASCADE`);
    await database.destroy();
  }
  return report;
}
async function compare(args) {
  return require('./comparison.cjs').compare(args);
}
async function run(args) {
  if (args[0] === 'approve-provenance') return require('./provenance.cjs').approveProvenance(args);
  if (args[0] === 'write-plans') return require('./write-plan-probe.cjs').writePlans(args);
  if (args[0] === 'fixture-parity') return require('./validate-schema-fixture.cjs').validateSchemaFixture(args);
  if (args[0] === 'outputs')
    return require('./output-artifacts.cjs').outputs(args);
  if (args[0] === 'matrix') return require('./matrix-runner.cjs').matrix(args);
  if (args[0] === 'mixed') return require('./mixed-workload.cjs').mixed(args);
  if (args[0] === 'capture') return capture(args);
  if (args[0] === 'compare') return compare(args);
  throw new Error(
    'Usage: benchmark-backend.ts capture --variant before|after | compare',
  );
}
module.exports = {
  run,
  capture,
  compare,
  guardDatabase,
  canonical,
  stats,
  createDatabase,
  seed,
  makeServices,
  sourceManifest,
  instrument,
  transports,
  workloads,
};
