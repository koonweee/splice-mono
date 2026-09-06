const { createHash } = require('node:crypto');
const USER = '10000000-0000-4000-8000-000000000001';
const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CLOCK = '2026-09-05T12:00:00.000Z';
const digest = (s) => createHash('md5').update(s).digest('hex');

/** Actual PostgreSQL reads/writes; failures and schedules are test-controlled. */
async function correctnessProbes(database, s) {
  const results = {};
  const terminal = await s.read.listTransactions(USER, {
    accountIds: [id(106)],
    pageSize: 100,
    reportingCurrency: 'USD',
  });
  results.terminalPage = {
    rows: terminal.data.length,
    hasMore: terminal.pageInfo.hasMore,
    expectedHasMore: false,
  };
  try {
    await s.conversion.getRateMap(['ZZZ'], 'USD', '2026-09-05');
    results.missingFx = { throws: false };
  } catch (error) {
    results.missingFx = { throws: true, message: error.message };
  }
  const CryptoProvider = s.cls(
    'bank-link/providers/crypto/crypto.provider',
    'CryptoProvider',
  );
  const crypto = new CryptoProvider(s.forbidden);
  const precise = crypto.createAPIAccount(
    'synthetic',
    'ethereum',
    '1.000000000000000001',
  ).currentBalance.money;
  const ordinary = crypto.createAPIAccount('synthetic', 'ethereum', '10')
    .currentBalance.money;
  let acceptsTenEth = true;
  try {
    await database.query(
      `UPDATE account_entity SET "currentBalanceAmount"=$1 WHERE id=$2`,
      ['10000000000000000000', id(110)],
    );
  } catch (error) {
    acceptsTenEth = false;
    if (error.driverError?.code !== '22003') throw error;
  }
  results.exactMoney = {
    expectedWei: '1000000000000000001',
    providerWei: String(precise.amount),
    tenEthProviderWei: String(ordinary.amount),
    postgresAcceptsTenEth: acceptsTenEth,
  };
  await database.query(
    `UPDATE account_entity SET "currentBalanceAmount"=100000 WHERE id=$1`,
    [id(110)],
  );

  await database.query(
    `INSERT INTO balance_snapshot_entity(id,"userId","accountId","snapshotDate","snapshotType","currentBalanceAmount","currentBalanceCurrency","currentBalanceSign","availableBalanceAmount","availableBalanceCurrency","availableBalanceSign","createdAt","updatedAt") VALUES ($1,$2,$3,'2026-09-05','USER_UPDATE',0,'USD','positive',0,'USD','positive',$4,$4)`,
    [digest('cleared'), USER, id(1), CLOCK],
  );
  if (s.holdingsQuery)
    await database.query(
      `INSERT INTO holdings_snapshot_header_entity(id,"userId","accountId",provider,"snapshotDate","completedAt","accountCurrency","accountValueAmount","accountValueSign") VALUES($1,$2,$3,'manual','2026-09-05',$4,'USD',0,'positive')`,
      [digest('cleared-header'), USER, id(1), CLOCK],
    );
  const web = await s.investment.findLatestHoldingsForAccount(USER, id(1));
  const mcp = await s.read.listInvestmentHoldings(USER, {
    accountIds: [id(1)],
  });
  results.clearedHoldings = {
    webHoldings: web.holdings.length,
    mcpHoldings: mcp.data.length,
    expectedHoldings: 0,
  };
  await database.query(`DELETE FROM balance_snapshot_entity WHERE id=$1`, [
    digest('cleared'),
  ]);
  if (s.holdingsQuery)
    await database.query(
      `DELETE FROM holdings_snapshot_header_entity WHERE id=$1`,
      [digest('cleared-header')],
    );
  const link = '40000000-0000-4000-8000-000000000001';
  await database.query(
    `INSERT INTO bank_link_entity(id,"userId","providerName",authentication,"accountIds") VALUES($1,$2,'plaid','{}','')`,
    [link, USER],
  );
  await database.query(
    `UPDATE account_entity SET "bankLinkId"=$1,"externalAccountId"='probe-'||id::text,"valuationMode"='balance' WHERE id=ANY($2::uuid[])`,
    [link, [id(1), id(2)]],
  );
  const partialToken = s.investment.beginProviderSync
    ? await s.investment.beginProviderSync(USER, link, 'holdings')
    : undefined;

  await database.query(
    `ALTER TABLE investment_holding_snapshot_entity ADD CONSTRAINT benchmark_injected_failure CHECK ("snapshotDate" <> DATE '2026-09-05' OR "accountId" <> '${id(2)}'::uuid)`,
  );
  const security = {
    externalSecurityId: 'atomic-security',
    name: 'Synthetic atomic security',
    tickerSymbol: 'ATOM',
    type: 'equity',
    isoCurrencyCode: 'USD',
  };
  const holding = {
    externalSecurityId: security.externalSecurityId,
    quantity: '1',
    institutionPrice: '10',
    institutionValue: '10',
    isoCurrencyCode: 'USD',
  };
  let rejected = false;
  try {
    await s.investment.upsertPlaidHoldings(
      USER,
      new Map([
        ['external-one', id(1)],
        ['external-two', id(2)],
      ]),
      '2026-09-05',
      {
        externalAccountIds: ['external-one', 'external-two'],
        securities: [security],
        holdings: [
          { ...holding, externalAccountId: 'external-one' },
          { ...holding, externalAccountId: 'external-two' },
        ],
      },
      partialToken,
    );
  } catch (error) {
    rejected = true;
    if (!/benchmark_injected_failure/.test(error.message)) throw error;
  }
  const partial = await database.query(
    `SELECT count(*)::int count FROM investment_holding_snapshot_entity WHERE "snapshotDate"='2026-09-05'`,
  );
  results.atomicHoldings = {
    injectedDatabaseFailure: rejected,
    persistedPositions: partial[0].count,
    expectedPersistedPositions: 0,
  };
  await database.query(
    'ALTER TABLE investment_holding_snapshot_entity DROP CONSTRAINT benchmark_injected_failure',
  );
  await database.query(
    `DELETE FROM investment_holding_snapshot_entity WHERE "snapshotDate"='2026-09-05'`,
  );
  await database.query(
    `DELETE FROM investment_security_entity WHERE "externalSecurityId"='atomic-security'`,
  );
  const olderToken = s.investment.beginProviderSync
    ? await s.investment.beginProviderSync(USER, link, 'holdings')
    : undefined;
  const newerToken = s.investment.beginProviderSync
    ? await s.investment.beginProviderSync(USER, link, 'holdings')
    : undefined;
  const olderSecurity = { ...security, externalSecurityId: 'ordering-old' };
  const newerSecurity = { ...security, externalSecurityId: 'ordering-new' };
  const response = (sec) => ({
    externalAccountIds: ['external-one'],
    securities: [sec],
    holdings: [
      {
        ...holding,
        externalAccountId: 'external-one',
        externalSecurityId: sec.externalSecurityId,
      },
    ],
  });
  await s.investment.upsertPlaidHoldings(
    USER,
    new Map([['external-one', id(1)]]),
    '2026-09-05',
    response(newerSecurity),
    newerToken,
  );
  let staleRejected = false;
  try {
    await s.investment.upsertPlaidHoldings(
      USER,
      new Map([['external-one', id(1)]]),
      '2026-09-05',
      response(olderSecurity),
      olderToken,
    );
  } catch (error) {
    if (!s.holdingsQuery) throw error;
    staleRejected = true;
  }
  const latest = await database.query(
    `SELECT security."externalSecurityId" FROM investment_holding_snapshot_entity holding JOIN investment_security_entity security ON security.id=holding."securityId" WHERE holding."snapshotDate"='2026-09-05' AND holding."accountId"=$1`,
    [id(1)],
  );
  results.reversedSyncCompletion = {
    staleRejected,
    latestSecurities: latest.map((row) => row.externalSecurityId),
    expectedSecurities: ['ordering-new'],
  };
  await database.query(
    `DELETE FROM investment_holding_snapshot_entity WHERE "snapshotDate"='2026-09-05'`,
  );
  if (s.holdingsQuery)
    await database.query(
      `DELETE FROM holdings_snapshot_header_entity WHERE "snapshotDate"='2026-09-05'`,
    );
  await database.query(
    `DELETE FROM investment_security_entity WHERE "externalSecurityId" IN ('ordering-old','ordering-new')`,
  );
  await database.query(
    `UPDATE account_entity SET "bankLinkId"=NULL,"externalAccountId"=NULL,"valuationMode"='holdings' WHERE id=ANY($1::uuid[])`,
    [[id(1), id(2)]],
  );

  let lostUpdates = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    await database.query(
      `UPDATE user_entity SET settings=$1::jsonb WHERE id=$2`,
      [JSON.stringify({ currency: 'USD', timezone: 'UTC' }), USER],
    );
    await Promise.all([
      s.user.updateSettings(USER, { currency: 'EUR' }),
      s.user.updateSettings(USER, { timezone: 'America/Los_Angeles' }),
    ]);
    const [{ settings }] = await database.query(
      'SELECT settings FROM user_entity WHERE id=$1',
      [USER],
    );
    if (
      settings.currency !== 'EUR' ||
      settings.timezone !== 'America/Los_Angeles'
    )
      lostUpdates++;
  }
  results.parallelSettings = {
    attempts: 20,
    lostUpdates,
    expectedLostUpdates: 0,
  };
  await database.query(
    `UPDATE user_entity SET settings=$1::jsonb WHERE id=$2`,
    [
      JSON.stringify({
        currency: 'USD',
        timezone: 'UTC',
        neutralizationLookaroundDays: 0,
      }),
      USER,
    ],
  );
  await database.query(
    `INSERT INTO account_activity_entity(id,"userId","accountId",provider,"activityKind","activityDate","providerDate","amountAmount","amountCurrency","amountSign") SELECT md5('rounding-'||n)::uuid,$1,$2,'manual','banking_transaction','2015-01-01','2015-01-01',1,'EUR','negative' FROM generate_series(1,2)n`,
    [USER, id(101)],
  );
  await database.query(
    `INSERT INTO banking_transaction_entity(id,"activityId",source,"merchantName",pending) SELECT md5('rounding-txn-'||n)::uuid,md5('rounding-'||n)::uuid,'manual','Rounding example',false FROM generate_series(1,2)n`,
  );
  await database.query(
    `INSERT INTO exchange_rate_entity("baseCurrency","targetCurrency",rate,"rateDate") VALUES('EUR','USD',1.5,'2015-01-01')`,
  );
  const summary = await s.analysis.getAnalysis(
    '2015-01-01',
    '2015-01-01',
    USER,
  );
  const detail = await s.analysis.getCategoryTransactions(
    '2015-01-01',
    '2015-01-01',
    'UNCATEGORIZED',
    'outflow',
    USER,
  );
  results.rowRounding = {
    summaryMinorUnits: String(summary.totalOutflow),
    drilldownMinorUnits: String(
      detail.reduce(
        (sum, row) => sum + BigInt(row.convertedAmount.money.amount),
        0n,
      ),
    ),
    expectedMinorUnits: '4',
  };
  await database.query(
    `DELETE FROM account_activity_entity WHERE "activityDate"='2015-01-01'`,
  );
  await database.query(
    `DELETE FROM exchange_rate_entity WHERE "rateDate"='2015-01-01'`,
  );
  return results;
}
function validateCorrectness(results) {
  const failures = [];
  const check = (condition, name) => {
    if (!condition) failures.push(name);
  };
  check(results.terminalPage.hasMore === false, 'terminal continuation');
  check(results.missingFx.throws === true, 'missing FX failure');
  check(
    results.exactMoney.providerWei === results.exactMoney.expectedWei &&
      results.exactMoney.postgresAcceptsTenEth === true,
    'exact ETH persistence',
  );
  check(
    results.clearedHoldings.webHoldings === 0 &&
      results.clearedHoldings.mcpHoldings === 0,
    'cleared holdings',
  );
  check(
    results.atomicHoldings.injectedDatabaseFailure &&
      results.atomicHoldings.persistedPositions === 0,
    'atomic holdings',
  );
  check(
    results.reversedSyncCompletion.staleRejected &&
      JSON.stringify(results.reversedSyncCompletion.latestSecurities) ===
        JSON.stringify(results.reversedSyncCompletion.expectedSecurities),
    'stale sync fencing',
  );
  check(results.parallelSettings.lostUpdates === 0, 'settings concurrency');
  check(
    results.rowRounding.summaryMinorUnits === '4' &&
      results.rowRounding.drilldownMinorUnits === '4',
    'row rounding reconciliation',
  );
  if (failures.length)
    throw new Error('Correctness regressions: ' + failures.join(', '));
}
module.exports = { correctnessProbes, validateCorrectness };
