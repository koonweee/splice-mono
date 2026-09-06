const USER = '10000000-0000-4000-8000-000000000003';
const BANK = '20000000-0000-4000-8000-000000000901';
const HISTORY = '20000000-0000-4000-8000-000000000902';
const CLOCK = '2026-09-05T12:00:00.000Z';

/** Untimed edge cases, separate from equivalent-output latency comparisons. */
async function runEdgeCorrectness(database, services) {
  const results = {};
  const money = {
    money: { amount: services.stringMoney ? '1000' : 1000, currency: 'USD' },
    sign: 'negative',
  };
  const transaction = (externalTransactionId, extra = {}) => ({
    accountId: 'edge-provider-account',
    externalTransactionId,
    providerDate: '2026-09-05',
    merchantName: 'Original',
    pending: false,
    amount: money,
    ...extra,
  });
  const sync = (added, modified = []) =>
    services.transaction.processSyncResults(
      USER,
      new Map([['edge-provider-account', BANK]]),
      { added, modified, removed: [], hasMore: false, nextCursor: 'edge-next' },
    );
  const rows = () =>
    database.query(
      `SELECT a."externalActivityId" AS "externalId",a."amountAmount"::text AS "amountMinor",b.pending,b."merchantName",b."reportingDateOverride"::text AS "reportingDateOverride",a."activityDate"::text AS "storedActivityDate" FROM account_activity_entity a JOIN banking_transaction_entity b ON b."activityId"=a.id WHERE a."accountId"=$1 ORDER BY a."externalActivityId"`,
      [BANK],
    );
  // Isolated identities avoid changing the main seed or its rules/settings.
  await database.query(
    `INSERT INTO user_entity(id,email,"googleSubject",settings,"createdAt","updatedAt") VALUES($1,'edge-probe@example.test','edge-probe','{"currency":"USD","timezone":"UTC"}',$2,$2)`,
    [USER, CLOCK],
  );
  try {
    await database.query(
      `INSERT INTO account_entity(id,"userId",name,type,"subType","valuationMode","availableBalanceAmount","availableBalanceCurrency","availableBalanceSign","currentBalanceAmount","currentBalanceCurrency","currentBalanceSign","createdAt","updatedAt") VALUES($1,$3,'Edge banking','depository','checking','balance',1000,'USD','positive',1000,'USD','positive',$4,$4),($2,$3,'Edge foreign history','depository','checking','balance',1000,'CHF','positive',1000,'CHF','positive',$4,$4)`,
      [BANK, HISTORY, USER, CLOCK],
    );
    let duplicateError = null;
    try {
      await sync(
        [
          transaction('edge-duplicate'),
          transaction('edge-duplicate', { merchantName: 'Second' }),
        ],
        [transaction('edge-duplicate', { merchantName: 'Final' })],
      );
    } catch (error) {
      if (services.stringMoney || error.driverError?.code !== '23505')
        throw error;
      duplicateError = '23505';
    }
    results.duplicateResponse = {
      databaseErrorCode: duplicateError,
      rows: await rows(),
      expected: {
        count: 1,
        externalId: 'edge-duplicate',
        merchantName: 'Final',
      },
    };
    await database.query(
      'DELETE FROM account_activity_entity WHERE "accountId"=$1',
      [BANK],
    );

    await sync([transaction('edge-pending', { pending: true })]);
    await database.query(
      `UPDATE banking_transaction_entity SET "reportingDateOverride"='2026-08-01' WHERE "activityId" IN (SELECT id FROM account_activity_entity WHERE "accountId"=$1)`,
      [BANK],
    );
    let replacementError = null;
    try {
      await sync([
        transaction('edge-posted', { pendingTransactionId: 'edge-pending' }),
        transaction('edge-pending', { pending: true }),
      ]);
      await sync([transaction('edge-pending', { pending: true })]);
    } catch (error) {
      if (services.stringMoney || error.driverError?.code !== '23505')
        throw error;
      replacementError = '23505';
    }
    results.pendingReplacementAndRetry = {
      databaseErrorCode: replacementError,
      rows: await rows(),
      expected: {
        count: 1,
        externalId: 'edge-posted',
        pending: false,
        reportingDateOverride: '2026-08-01',
        storedActivityDate: '2026-08-01',
      },
    };

    const [{ count: availableQuotes }] = await database.query(
      `SELECT count(*)::int count FROM exchange_rate_entity WHERE ("baseCurrency"='CHF' AND "targetCurrency"='USD') OR ("baseCurrency"='USD' AND "targetCurrency"='CHF')`,
    );
    if (availableQuotes !== 0)
      throw new Error('Missing-rate fixture has a quote');
    await database.query(
      `INSERT INTO balance_snapshot_entity("userId","accountId","snapshotDate","snapshotType","currentBalanceAmount","currentBalanceCurrency","currentBalanceSign","availableBalanceAmount","availableBalanceCurrency","availableBalanceSign","createdAt","updatedAt") VALUES($1,$2,'2026-09-05','USER_UPDATE',1000,'CHF','positive',1000,'CHF','positive',$3,$3)`,
      [USER, HISTORY, CLOCK],
    );
    try {
      const summary = await services.history.getBalanceHistorySummary(USER, {
        startDate: '2026-09-05',
        endDate: '2026-09-05',
        accountIds: [HISTORY],
      });
      results.historyMissingFx = {
        throws: false,
        returnedNetWorth: summary.netWorth,
        expectedThrows: true,
      };
    } catch (error) {
      if (!/exchange rate|conversion is incomplete/i.test(error.message))
        throw error;
      results.historyMissingFx = {
        throws: true,
        message: error.message,
        expectedThrows: true,
      };
    }
    return results;
  } finally {
    await database.query(
      'DELETE FROM account_activity_entity WHERE "userId"=$1',
      [USER],
    );
    await database.query(
      'DELETE FROM balance_snapshot_entity WHERE "userId"=$1',
      [USER],
    );
    await database.query('DELETE FROM account_entity WHERE "userId"=$1', [
      USER,
    ]);
    await database.query('DELETE FROM user_entity WHERE id=$1', [USER]);
  }
}

function validateEdgeCorrectness(results) {
  const duplicates = results.duplicateResponse;
  if (
    duplicates.databaseErrorCode !== null ||
    duplicates.rows.length !== 1 ||
    duplicates.rows[0].externalId !== 'edge-duplicate' ||
    duplicates.rows[0].merchantName !== 'Final' ||
    duplicates.rows[0].amountMinor !== '1000' ||
    duplicates.rows[0].pending !== false
  )
    throw new Error('Duplicate-response correctness regression');
  const pending = results.pendingReplacementAndRetry;
  if (
    pending.databaseErrorCode !== null ||
    pending.rows.length !== 1 ||
    pending.rows[0].externalId !== 'edge-posted' ||
    pending.rows[0].pending !== false ||
    pending.rows[0].amountMinor !== '1000' ||
    pending.rows[0].reportingDateOverride !== '2026-08-01' ||
    pending.rows[0].storedActivityDate !== '2026-08-01'
  )
    throw new Error('Pending-replacement correctness regression');
  if (results.historyMissingFx.throws !== true)
    throw new Error('History must reject a missing required exchange rate');
}

module.exports = { runEdgeCorrectness, validateEdgeCorrectness };
