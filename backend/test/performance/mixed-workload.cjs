const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { Logger } = require('@nestjs/common');
const USER = '10000000-0000-4000-8000-000000000001';
const arg = (args, name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};

async function mixed(args) {
  const harness = require('./benchmark-runner.cjs');
  const root = path.resolve(process.env.BENCHMARK_SOURCE_ROOT || process.cwd());
  const source = fs.existsSync(path.join(root, '.benchmark-build/src'))
    ? path.join(root, '.benchmark-build/src')
    : path.join(root, '.benchmark-build');
  require('tsconfig-paths').register({
    baseUrl: source,
    paths: { 'src/*': ['*'], '@/*': ['*'] },
  });
  Logger.overrideLogger(false);
  process.env.DISABLE_SCHEDULES = 'true';
  delete process.env.SEQ_SERVER_URL;
  delete process.env.SEQ_API_KEY;
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : ['2026-09-05T12:00:00.000Z']));
    }
    static now() {
      return RealDate.parse('2026-09-05T12:00:00.000Z');
    }
  };
  const variant = arg(args, 'variant', 'before'),
    run = Number(arg(args, 'run', '1')),
    seconds = Number(arg(args, 'seconds', '30'));
  const concurrencies = arg(args, 'concurrencies', '1,5,10')
    .split(',')
    .map(Number);
  if (
    !['before', 'after'].includes(variant) ||
    !Number.isInteger(run) ||
    run < 1 ||
    seconds < 1 ||
    seconds > 300 ||
    !concurrencies.length ||
    new Set(concurrencies).size !== concurrencies.length ||
    concurrencies.some((value) => ![1, 5, 10].includes(value))
  )
    throw new Error('Invalid mixed-load options');
  const schema = `backend_bench_mixed_${crypto.randomUUID().replaceAll('-', '')}`;
  const output = path.resolve(
    arg(
      args,
      'output',
      path.join(__dirname, '../../docs/performance/backend-query/mixed'),
    ),
  );
  fs.mkdirSync(output, { recursive: true });
  const database = await harness.createDatabase(
    source,
    process.env.BACKEND_BENCHMARK_DATABASE_URL,
    schema,
  );
  let transport;
  const report = {
    variant,
    run,
    seconds,
    concurrencies,
    completed: false,
    fixtureHash: crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          rows: 10000,
          clock: '2026-09-05T12:00:00.000Z',
          seed: harness.seed.toString(),
        }),
      )
      .digest('hex'),
    method:
      'Actual loopback PAT HTTP and Auth0-test-authority MCP with a shared10-connection PostgreSQL pool. Warmed requests. Concurrent sync50-row application uses deterministic provider responses; no provider network or model calls.',
    environment: {
      node: process.version,
      cpu: os.cpus()[0].model,
      postgres: (await database.query('SELECT version() version'))[0].version,
      poolMax: 10,
    },
    source: {
      files: harness.sourceManifest(root),
      hash: crypto
        .createHash('sha256')
        .update(JSON.stringify(harness.sourceManifest(root)))
        .digest('hex'),
    },
    implementation: {
      applicationDatabaseMetrics: fs.existsSync(
        path.join(source, 'observability/request-metrics.js'),
      ),
      httpRequestMetrics: fs.existsSync(
        path.join(source, 'observability/request-metrics.module.js'),
      ),
    },
    provenance: require('./provenance.cjs').captureProvenance(root, 'mixed'),
    harness: { files: { 'benchmark-runner.cjs': crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'benchmark-runner.cjs'))).digest('hex') } },
    phases: [],
  };
  const filename = path.join(output, `${variant}-mixed-run${run}.json`);
  try {
    await harness.seed(database, 10000);
    report.fixtureAdapter =
      await require('./schema-fixture-adapter.cjs').applySchemaFixtureAdapter(
        database,
      );
    const s = harness.makeServices(database, source);
    transport = await harness.transports(s);
    const recorder = harness.instrument(database, { aggregate: true });
    const sync = require('./sync-workloads.cjs')
      .syncWorkloads(database, s)
      .find((w) => w.name === 'sync.banking.50.rules-off');
    const calls = {
      http: () => transport.http({ pageSize: '100', convert: 'true' }),
      mcp: () =>
        transport.mcp('list_transactions', {
          accountIds: ['20000000-0000-4000-8000-000000000106'],
          pageSize: 100,
          reportingCurrency: 'USD',
        }),
    };
    const selected = arg(args, 'transport', 'both');
    for (const [name, call] of Object.entries(calls).filter(
      ([name]) => selected === 'both' || selected === name,
    ))
      for (const concurrency of concurrencies)
        for (const withSync of [false, true]) {
          console.log(
            `Mixed ${name} concurrency${concurrency} sync${withSync} for${seconds}s`,
          );
          await sync.setup();
          for (let i = 0; i < 5; i++) await call();
          recorder.reset();
          const eventLoop = monitorEventLoopDelay({ resolution: 10 });
          eventLoop.enable();
          const cpuStart = process.cpuUsage(),
            started = performance.now(),
            deadline = started + seconds * 1000;
          const latencies = [],
            errors = [];
          let syncCalls = 0,
            finished = false;
          const syncLoop = withSync
            ? (async () => {
                while (!finished && performance.now() < deadline) {
                  const added = Array.from({ length: 50 }, (_, i) => ({
                    accountId: 'synthetic-external',
                    externalTransactionId: `benchmark-sync-${i}`,
                    providerDate: '2026-09-05',
                    merchantName: `Concurrent synthetic${syncCalls % 2}`,
                    pending: false,
                    amount: {
                      money: {
                        currency: 'USD',
                        amount: s.stringMoney ? '1000' : 1000,
                      },
                      sign: 'negative',
                    },
                  }));
                  await s.transaction.processSyncResults(
                    USER,
                    new Map([
                      [
                        'synthetic-external',
                        '20000000-0000-4000-8000-000000000109',
                      ],
                    ]),
                    {
                      added,
                      modified: [],
                      removed: [],
                      hasMore: false,
                      nextCursor: 'synthetic-mixed',
                    },
                  );
                  syncCalls++;
                }
              })().catch((error) => {
                errors.push('sync: ' + error.message);
                finished = true;
              })
            : Promise.resolve();
          await Promise.all(
            Array.from({ length: concurrency }, async () => {
              while (performance.now() < deadline) {
                const start = performance.now();
                try {
                  await call();
                  latencies.push(performance.now() - start);
                } catch (error) {
                  errors.push(error.message);
                }
              }
            }),
          );
          finished = true;
          await syncLoop;
          const elapsedMs = performance.now() - started,
            cpu = process.cpuUsage(cpuStart),
            statements = recorder.get(),
            poolWaits = recorder.getPoolWaits();
          eventLoop.disable();
          const phase = {
            transport: name,
            concurrency,
            withSync,
            elapsedMs,
            completedRequests: latencies.length,
            errorCount: errors.length,
            errors: [...new Set(errors)],
            requestsPerSecond: latencies.length / (elapsedMs / 1000),
            latencyMs: latencies.length ? harness.stats(latencies) : null,
            rawLatencyMs: latencies,
            syncCalls,
            cpuMs: (cpu.user + cpu.system) / 1000,
            selectCount: statements.filter((q) =>
              /^(SELECT|WITH)\b/i.test(q.sql.trimStart()),
            ).length,
            writeCount: statements.filter((q) =>
              /^(INSERT|UPDATE|DELETE)\b/i.test(q.sql.trimStart()),
            ).length,
            transactionStatements: statements.filter((q) =>
              /^(START TRANSACTION|BEGIN|COMMIT|ROLLBACK)\b/i.test(
                q.sql.trimStart(),
              ),
            ).length,
            poolWaitMs: poolWaits.length ? harness.stats(poolWaits) : null,
            eventLoopDelayMs: {
              mean: eventLoop.mean / 1e6,
              p95: eventLoop.percentile(95) / 1e6,
              max: eventLoop.max / 1e6,
            },
            endingMemory: process.memoryUsage(),
          };
          report.phases.push(phase);
          fs.writeFileSync(filename, JSON.stringify(report) + '\n');
          if (errors.length)
            throw new Error(`Mixed-load phase had ${errors.length} errors`);
        }
    report.completed = true;
    fs.writeFileSync(filename, JSON.stringify(report) + '\n');
    console.log(`Saved ${filename}`);
  } finally {
    if (transport) await transport.close();
    await database.query(`DROP SCHEMA "${schema}" CASCADE`);
    await database.destroy();
    global.Date = RealDate;
  }
  return report;
}
module.exports = { mixed };
