// Use only the explicitly opted-in disposable benchmark database and frozen compiled source.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { createDatabase, seed, guardDatabase } = require('../performance/benchmark-runner.cjs');
require('ts-node').register({ transpileOnly: true });
require('tsconfig-paths/register');
const { ExactMoney1788642000000 } = require('../../src/migrations/1788642000000-ExactMoney.ts');
const { AddHoldingsSnapshots1788643000000 } = require('../../src/migrations/1788643000000-AddHoldingsSnapshots.ts');
const { CanonicalTransactionActivityDates1788644000000 } = require('../../src/migrations/1788644000000-CanonicalTransactionActivityDates.ts');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const url = guardDatabase(process.env.BACKEND_BENCHMARK_DATABASE_URL);
  const baseline = path.resolve(process.env.BENCHMARK_SOURCE_ROOT, '.benchmark-build');
  const results = [];
  for (let repetition = 1; repetition <= 3; repetition++) {
    const schema = `splice_migration_probe_${crypto.randomBytes(8).toString('hex')}`;
    const database = await createDatabase(baseline, url, schema);
    try {
      await seed(database, 1000000);
      const runner = database.createQueryRunner(); await runner.connect();
      const [{ pid }] = await runner.query('SELECT pg_backend_pid() AS pid');
      const [{ version }] = await runner.query('SELECT version() AS version');
      const locks = new Map(); let observing = true; let blockedRead; let blockedStart;
      const origin = performance.now();
      const observer = (async () => {
        while (observing) {
          const rows = await database.query(`SELECT c.relname AS relation,l.mode FROM pg_locks l JOIN pg_class c ON c.oid=l.relation WHERE l.pid=$1 AND l.granted AND l.mode='AccessExclusiveLock'`, [pid]);
          const elapsed = performance.now() - origin;
          for (const row of rows) if (!locks.has(row.relation)) locks.set(row.relation, elapsed);
          if (!blockedRead && rows.some(row => row.relation === 'account_activity_entity')) {
            blockedStart = performance.now();
            blockedRead = database.query('SELECT id FROM account_activity_entity LIMIT 1').then(() => performance.now() - blockedStart);
          }
          await sleep(50);
        }
      })();
      const migrations = [];
      try {
        await runner.startTransaction();
        for (const Migration of [ExactMoney1788642000000, AddHoldingsSnapshots1788643000000, CanonicalTransactionActivityDates1788644000000]) {
          const start = performance.now(); await new Migration().up(runner);
          migrations.push({ name: Migration.name, milliseconds: performance.now() - start });
        }
        await runner.commitTransaction();
      } catch (error) { if (runner.isTransactionActive) await runner.rollbackTransaction(); throw error; }
      finally { observing = false; await observer; await runner.release(); }
      const totalMs = performance.now() - origin;
      const blockedReadMs = blockedRead ? await blockedRead : null;
      results.push({ repetition, rows: 1000000, postgres: version, migrations, totalMs, blockedReadMs, accessExclusiveLocks: [...locks].map(([relation, firstSeenMs]) => ({ relation, firstSeenMs, heldUntilCommitMsApprox: totalMs-firstSeenMs })) });
      console.log(JSON.stringify({ repetition, totalMs, blockedReadMs, migrations }));
    } finally { await database.query(`DROP SCHEMA "${schema}" CASCADE`); await database.destroy(); }
  }
  const report = { kind: 'local-migration-runtime-and-locks', recordedAt: new Date().toISOString(), node: process.version, cpu: os.cpus()[0].model, rows:1000000, fixture:'benchmark-runner seed version1 plus10000 holdings/12100 balance snapshots', transactionMode:'all', lockSamplingMs:50, caveat:'Lock durations sampled from first observed granted AccessExclusiveLock until completion; at most polling/observer scheduling error, not production estimates. Blocked SELECT launched after activity-table exclusive lock was observed.', results };
  const output = path.resolve('docs/performance/migrations/backend-query-2026-09-05.json');
  fs.mkdirSync(path.dirname(output),{recursive:true}); fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
