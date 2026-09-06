const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const harness = require('./benchmark-runner.cjs');
const { applySchemaFixtureAdapter } = require('./schema-fixture-adapter.cjs');
const { syncWorkloads } = require('./sync-workloads.cjs');

/**
 * Explain service-emitted writes on their real inputs, then roll the explanation
 * back before normal execution. This is a separate diagnostic, never a latency
 * sample. Savepoints preserve the enclosing service transaction and returned IDs.
 */
function observeWritePlans(database) {
  const create = database.createQueryRunner.bind(database);
  let active = null;
  let seen = new Set();
  const results = {};
  database.createQueryRunner = (...args) => {
    const runner = create(...args);
    const query = runner.query.bind(runner);
    runner.query = async (sql, parameters, structured) => {
      const normalized = sql.trimStart();
      const signature = normalized.replace(/\$\d+/g, '$?');
      if (
        active &&
        /^(INSERT|UPDATE|DELETE)\b/i.test(normalized) &&
        !seen.has(signature)
      ) {
        seen.add(signature);
        const enclosing = runner.isTransactionActive;
        if (enclosing) await query('SAVEPOINT benchmark_write_explain');
        else await query('BEGIN');
        try {
          const plan = await query(
            'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + sql,
            parameters,
          );
          results[active].push({ sql, parameters, plan });
        } finally {
          if (enclosing) {
            await query('ROLLBACK TO SAVEPOINT benchmark_write_explain');
            await query('RELEASE SAVEPOINT benchmark_write_explain');
          } else await query('ROLLBACK');
        }
      }
      return query(sql, parameters, structured);
    };
    return runner;
  };
  return {
    start(name) {
      active = name;
      seen = new Set();
      results[name] = [];
    },
    stop() {
      active = null;
    },
    results,
  };
}

async function writePlans(args) {
  const at = args.indexOf('--variant');
  const variant = args[at + 1];
  if (at < 0 || !['before', 'after'].includes(variant))
    throw new Error('write-plans requires --variant before|after');
  const sourceRoot = path.resolve(process.env.BENCHMARK_SOURCE_ROOT);
  const buildRoot = fs.existsSync(path.join(sourceRoot, '.benchmark-build/src'))
    ? path.join(sourceRoot, '.benchmark-build/src')
    : path.join(sourceRoot, '.benchmark-build');
  require('tsconfig-paths').register({
    baseUrl: buildRoot,
    paths: { 'src/*': ['*'], '@/*': ['*'] },
  });
  require('@nestjs/common').Logger.overrideLogger(false);
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...values) {
      super(...(values.length ? values : ['2026-09-05T12:00:00.000Z']));
    }
    static now() {
      return RealDate.parse('2026-09-05T12:00:00.000Z');
    }
  };
  const schema = `backend_bench_write_plans_${crypto.randomUUID().replaceAll('-', '')}`;
  const database = await harness.createDatabase(
    buildRoot,
    process.env.BACKEND_BENCHMARK_DATABASE_URL,
    schema,
  );
  try {
    await harness.seed(database, 10000);
    const fixtureAdapter = await applySchemaFixtureAdapter(database);
    const services = harness.makeServices(database, buildRoot);
    const observer = observeWritePlans(database);
    const selected = new Set([
      'sync.banking.500.rules-on',
      'sync.banking-modified.500.rules-on',
      'sync.investment-transactions.500',
      'sync.holdings.0-positions',
      'sync.holdings.100-positions',
    ]);
    for (const workload of syncWorkloads(database, services).filter(
      (workload) => selected.has(workload.name),
    )) {
      await workload.setup();
      observer.start(workload.name);
      await workload.call();
      observer.stop();
      await workload.verify();
      if (!observer.results[workload.name].length)
        throw new Error('No write plans captured for ' + workload.name);
    }
    const outputAt = args.indexOf('--output');
    const directory = path.resolve(
      outputAt < 0
        ? path.join(
            __dirname,
            '../../docs/performance/backend-query/write-plans',
          )
        : args[outputAt + 1],
    );
    fs.mkdirSync(directory, { recursive: true });
    const report = {
      completed: true,
      variant,
      source: harness.sourceManifest(sourceRoot),
      fixtureAdapter,
      method:
        'Representative unique SQL writes emitted by actual services. EXPLAIN ANALYZE runs on current input under a savepoint (or standalone transaction), is rolled back, then the normal statement executes. Final provider state is verified. Diagnostic execution times are not normal request latency or part of primary samples.',
      plans: observer.results,
    };
    fs.writeFileSync(
      path.join(directory, `${variant}.json`),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(
      `Saved ${variant} actual sync write plans for ${selected.size} verified workloads.`,
    );
    return report;
  } finally {
    await database.query(`DROP SCHEMA "${schema}" CASCADE`);
    await database.destroy();
    global.Date = RealDate;
  }
}
module.exports = { writePlans, observeWritePlans };
