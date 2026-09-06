// Rehearse backup/restore only in a guarded, test-owned local schema.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
require('ts-node').register({ transpileOnly: true });
require('tsconfig-paths/register');
// The shared helper also exports a Jest suite selector; this CLI uses only its schema lifecycle.
global.describe = () => { throw new Error('A test suite must not run in the recovery CLI'); };
const { isolatedPostgres } = require('../helpers/isolated-postgres.ts');
const { ExactMoney1788642000000 } = require('../../src/migrations/1788642000000-ExactMoney.ts');
async function main() {
  const harness = await isolatedPostgres('recovery_probe', 1788642000000);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'splice-recovery-'));
  const dump = path.join(temporary, 'baseline.dump');
  const connection = new URL(process.env.BACKEND_BENCHMARK_DATABASE_URL);
  const pgEnv = { ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || '5432', PGDATABASE: 'splice_backend_benchmark', PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password) };
  function run(binary, args) {
    const result = spawnSync(binary, args, { env: pgEnv, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${binary} failed: ${result.stderr}`);
  }
  const migrate = async direction => {
    const runner = harness.database.createQueryRunner();
    await runner.connect(); await runner.startTransaction();
    try { await new ExactMoney1788642000000()[direction](runner); await runner.commitTransaction(); }
    catch (error) { await runner.rollbackTransaction(); throw error; }
    finally { await runner.release(); }
  };
  try {
    const [user] = await harness.database.query(`INSERT INTO user_entity (email,"googleSubject","displayName") VALUES ($1,$2,'Recovery fixture') RETURNING id`, [`${crypto.randomUUID()}@example.test`, crypto.randomUUID()]);
    const [account] = await harness.database.query(`INSERT INTO account_entity ("userId",name,type,"availableBalanceAmount","availableBalanceCurrency","availableBalanceSign","currentBalanceAmount","currentBalanceCurrency","currentBalanceSign","rawApiAccount") VALUES ($1,'Recovery fixture','depository',0,'ETH','positive',1234,'ETH','positive','{"balance":{"money":{"amount":9007199254740993,"currency":"ETH"},"sign":"positive"}}'::jsonb) RETURNING id`, [user.id]);
    run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--schema', harness.schema, '--file', dump]);
    const backup = fs.readFileSync(dump);
    await migrate('up');
    await harness.database.query('UPDATE account_entity SET "currentBalanceAmount"=$1 WHERE id=$2', ['10000000000000000000', account.id]);
    let refused = false;
    try { await migrate('down'); } catch (error) { if (!String(error).includes('old bigint range')) throw error; refused = true; }
    if (!refused) throw new Error('Lossy downgrade was not refused');
    const [retained] = await harness.database.query('SELECT "currentBalanceAmount"::text AS amount,"rawApiAccount" FROM account_entity WHERE id=$1', [account.id]);
    if (retained.amount !== '10000000000000000000' || retained.rawApiAccount.balance.money.amount !== '9007199254740993') throw new Error('Refused downgrade altered final data');
    await harness.database.query(`DROP SCHEMA "${harness.schema}" CASCADE`);
    run('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--dbname', 'splice_backend_benchmark', dump]);
    const [restored] = await harness.database.query('SELECT "currentBalanceAmount"::text AS amount,"rawApiAccount"#>>\'{balance,money,amount}\' AS original_json_amount FROM account_entity WHERE id=$1', [account.id]);
    if (restored.amount !== '1234' || restored.original_json_amount !== '9007199254740993') throw new Error('Restored baseline values differ');
    await migrate('up');
    const [reapplied] = await harness.database.query('SELECT "rawApiAccount" FROM account_entity WHERE id=$1', [account.id]);
    if (reapplied.rawApiAccount.balance.money.amount !== '9007199254740993') throw new Error('Reapplication lost exact source JSON');
    const report = { recordedAt: new Date().toISOString(), kind: 'local-backup-restore-rehearsal', backupBytes: backup.length, backupSha256: crypto.createHash('sha256').update(backup).digest('hex'), lossyDowngradeRefused: refused, finalDataPreservedAfterRefusal: true, originalBaselineRestored: true, exactJsonPreservedAndRemigrated: true, postBackupWritesReverted: true, scope: 'one synthetic test-owned schema; not a production backup validation' };
    const output = path.resolve('docs/performance/migrations/exact-money-recovery.json');
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2)+'\n');
    console.log(JSON.stringify(report));
  } finally { await harness.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
