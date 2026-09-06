const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const harness = require('./benchmark-runner.cjs');
const { applySchemaFixtureAdapter } = require('./schema-fixture-adapter.cjs');

async function validateSchemaFixture(args) {
  const originalRoot = path.resolve(process.env.BENCHMARK_SOURCE_ROOT);
  const finalRoot = path.resolve(process.env.BENCHMARK_FINAL_SOURCE_ROOT);
  const build = (root) =>
    fs.existsSync(path.join(root, '.benchmark-build/src'))
      ? path.join(root, '.benchmark-build/src')
      : path.join(root, '.benchmark-build');
  const databases = [];
  const snapshots = [];
  const migrations = [];
  try {
    for (const [variant, root] of [
      ['migrated', originalRoot],
      ['fresh-final', finalRoot],
    ]) {
      require('tsconfig-paths').register({
        baseUrl: build(root),
        paths: { 'src/*': ['*'], '@/*': ['*'] },
      });
      const schema = `backend_bench_fixture_${crypto.randomUUID().replaceAll('-', '')}`;
      const database = await harness.createDatabase(
        build(root),
        process.env.BACKEND_BENCHMARK_DATABASE_URL,
        schema,
      );
      databases.push({ database, schema });
      await harness.seed(database, 10000);
      if (variant === 'migrated') {
        const runner = database.createQueryRunner();
        await runner.startTransaction();
        try {
          for (const file of fs
            .readdirSync(path.join(build(finalRoot), 'migrations'))
            .filter((file) => /^178864[234]000000-.*\.js$/.test(file))
            .sort()) {
            const Migration = Object.values(
              require(path.join(build(finalRoot), 'migrations', file)),
            ).find((value) => typeof value === 'function');
            await new Migration().up(runner);
            migrations.push(Migration.name);
          }
          if (migrations.length !== 3)
            throw new Error('Expected the three actual final migrations');
          await runner.commitTransaction();
        } catch (error) {
          await runner.rollbackTransaction();
          throw error;
        } finally {
          await runner.release();
        }
      } else await applySchemaFixtureAdapter(database);
      const headers = await database.query(
        `SELECT header."userId",header."accountId",header.provider,header."snapshotDate"::text,header.revision,header."accountCurrency",header."accountValueAmount"::text,header."accountValueSign",to_char(header."completedAt",'YYYY-MM-DD HH24:MI:SS') AS completed,count(holding.id)::int positions FROM holdings_snapshot_header_entity header LEFT JOIN investment_holding_snapshot_entity holding ON holding."headerId"=header.id GROUP BY header.id ORDER BY header."accountId",header.provider,header."snapshotDate"`,
      );
      const latest = await database.query(
        `SELECT DISTINCT ON(header."accountId") header."accountId",header."snapshotDate"::text,(SELECT count(*)::int FROM investment_holding_snapshot_entity holding WHERE holding."headerId"=header.id) AS positions FROM holdings_snapshot_header_entity header ORDER BY header."accountId",header."snapshotDate" DESC`,
      );
      const digest = crypto
        .createHash('sha256')
        .update(JSON.stringify(headers))
        .digest('hex');
      if (
        headers.length !== 12200 ||
        latest.length !== 100 ||
        latest.some(
          (row) => row.snapshotDate !== '2026-09-04' || row.positions !== 100,
        )
      )
        throw new Error('Derived fixture changed latest factual holdings');
      snapshots.push({
        variant,
        headerCount: headers.length,
        latestAccounts: latest.length,
        positionsPerLatestAccount: 100,
        headerFactsDigest: digest,
        sourceHash: crypto
          .createHash('sha256')
          .update(JSON.stringify(harness.sourceManifest(root)))
          .digest('hex'),
      });
    }
    if (snapshots[0].headerFactsDigest !== snapshots[1].headerFactsDigest)
      throw new Error(
        'Fresh final schema adapter differs from actual migrated baseline facts',
      );
    const report = {
      completed: true,
      method:
        'Same10k seed; actual final migrations on original schema versus fresh final schema with derived-header adapter. Compare every header owner/provider/date/revision/valuation/completion time and position count, excluding generated header UUIDs.',
      migrations,
      snapshots,
    };
    const index = args.indexOf('--output');
    const output = path.resolve(
      index < 0
        ? path.join(
            __dirname,
            '../../docs/performance/backend-query/schema-fixture-parity.json',
          )
        : args[index + 1],
    );
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(
      'Schema fixture matches all12,200 migrated headers and100latest complete portfolios.',
    );
    return report;
  } finally {
    for (const { database, schema } of databases) {
      await database.query(`DROP SCHEMA "${schema}" CASCADE`);
      await database.destroy();
    }
  }
}
module.exports = { validateSchemaFixture };
