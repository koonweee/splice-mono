const USER = '10000000-0000-4000-8000-000000000001';
const RULE = '61000000-0000-4000-8000-000000000001';
const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function shapeWorkloads(database, services) {
  const cases = [];
  for (const lookaround of [0, 30])
    for (const [period, start] of [
      ['month', '2026-08-06'],
      ['year', '2025-09-05'],
    ]) {
      cases.push({
        name: `shape.cashflow.${period}.rules-on.lookaround-${lookaround}`,
        layer: 'service+postgres',
        policy: 'row-rounding-policy',
        setup: async () => {
          await database.query(
            `UPDATE user_entity SET settings=jsonb_set(settings,'{neutralizationLookaroundDays}',$1::jsonb) WHERE id=$2`,
            [String(lookaround), USER],
          );
          await database.query(
            `INSERT INTO analysis_rule_entity(id,"userId",name,type,"inflowScope","outflowScope") VALUES($1,$2,'Synthetic matching','neutralize','{"mode":"all"}','{"mode":"all"}') ON CONFLICT(id) DO NOTHING`,
            [RULE, USER],
          );
        },
        call: () => services.report(start, '2026-09-05'),
      });
    }
  let backedUp = false;
  let historyConfiguration;
  async function historyFixture(dense, foreign) {
    const configuration = `${dense}/${foreign}`;
    if (historyConfiguration === configuration) return;
    if (!backedUp) {
      await database.query(
        'CREATE TABLE benchmark_original_balances AS SELECT * FROM balance_snapshot_entity',
      );
      backedUp = true;
    }
    await database.query('DELETE FROM balance_snapshot_entity');
    await database.query(
      'INSERT INTO balance_snapshot_entity SELECT * FROM benchmark_original_balances',
    );
    await database.query(
      `UPDATE account_entity SET "currentBalanceCurrency"=$1,"availableBalanceCurrency"=$1 WHERE "userId"=$2 AND type='investment'`,
      [foreign ? 'EUR' : 'USD', USER],
    );
    if (dense)
      await database.query(
        `INSERT INTO balance_snapshot_entity(id,"userId","accountId","snapshotDate","snapshotType","currentBalanceAmount","currentBalanceCurrency","currentBalanceSign","availableBalanceAmount","availableBalanceCurrency","availableBalanceSign","createdAt","updatedAt") SELECT md5('dense-'||a||d)::uuid,$1,('20000000-0000-4000-8000-'||lpad(a::text,12,'0'))::uuid,d::date,'USER_UPDATE',100000+a*100,'USD','positive',100000+a*100,'USD','positive','2026-09-05T12:00:00.000Z'::timestamp,'2026-09-05T12:00:00.000Z'::timestamp FROM generate_series(1,100) a CROSS JOIN generate_series(DATE '2025-09-05',DATE '2026-09-05',INTERVAL '1 day') d WHERE extract(day FROM d)<>1`,
        [USER],
      );
    if (foreign)
      await database.query(
        `UPDATE balance_snapshot_entity SET "currentBalanceCurrency"='EUR',"availableBalanceCurrency"='EUR'`,
      );
    await database.query('ANALYZE balance_snapshot_entity');
    historyConfiguration = configuration;
  }
  for (const accounts of [20, 100])
    for (const foreign of [false, true])
      cases.push({
        name: `shape.history.year.${accounts}-accounts.${foreign ? 'sparse-prior-fx' : 'dense'}.daily`,
        layer: 'service+postgres',
        policy:
          foreign && accounts === 100
            ? 'exact-balance-arithmetic-correction'
            : 'equivalent',
        setup: () => historyFixture(!foreign, foreign),
        call: () =>
          services.history.getBalanceHistorySummary(USER, {
            startDate: '2025-09-05',
            endDate: '2026-09-05',
            accountIds: Array.from({ length: accounts }, (_, i) => id(i + 1)),
          }),
      });
  return cases;
}
module.exports = { shapeWorkloads };
