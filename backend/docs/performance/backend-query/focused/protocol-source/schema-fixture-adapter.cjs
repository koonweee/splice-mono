/** Reproduce the migration's derived header facts after seeding a fresh final schema. */
async function applySchemaFixtureAdapter(database) {
  const [{ present }] = await database.query(
    "SELECT to_regclass('holdings_snapshot_header_entity') IS NOT NULL AS present",
  );
  if (!present) return { kind: 'original-schema', derivedHeaders: 0 };
  // Position-only history has no separate manual account valuation in the old input.
  await database.query(
    `UPDATE holdings_snapshot_header_entity SET "accountCurrency"=NULL,"accountValueAmount"=NULL,"accountValueSign"=NULL`,
  );
  await database.query(`INSERT INTO holdings_snapshot_header_entity(id,"userId","accountId",provider,"snapshotDate","completedAt","accountCurrency","accountValueAmount","accountValueSign","createdAt","updatedAt")
    SELECT md5('derived-header-'||snapshot.id)::uuid,snapshot."userId",snapshot."accountId",'manual',snapshot."snapshotDate",snapshot."updatedAt",
      snapshot."currentBalanceCurrency",snapshot."currentBalanceAmount",snapshot."currentBalanceSign",snapshot."createdAt",snapshot."updatedAt"
    FROM balance_snapshot_entity snapshot JOIN account_entity account ON account.id=snapshot."accountId" AND account."userId"=snapshot."userId"
    WHERE account."valuationMode"='holdings' AND account."bankLinkId" IS NULL AND snapshot."snapshotType" IN ('USER_UPDATE','MARKET_REFRESH')
    ON CONFLICT ("accountId",provider,"snapshotDate") DO UPDATE SET
      "completedAt"=EXCLUDED."completedAt","accountCurrency"=EXCLUDED."accountCurrency","accountValueAmount"=EXCLUDED."accountValueAmount","accountValueSign"=EXCLUDED."accountValueSign","updatedAt"=EXCLUDED."updatedAt"`);
  await database.query('ANALYZE holdings_snapshot_header_entity');
  const [{ count }] = await database.query(
    'SELECT count(*)::int count FROM holdings_snapshot_header_entity',
  );
  return {
    kind: 'migration-derived-holdings-headers',
    totalHeaders: count,
    positionHeaders: 100,
    derivedHeaders: count - 100,
  };
}
module.exports = { applySchemaFixtureAdapter };
