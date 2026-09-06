const USER = '10000000-0000-4000-8000-000000000001';
const ACCOUNT = '20000000-0000-4000-8000-000000000101';

/** Independent documented magnitude/date/time/id ordering, outside timed reads. */
async function verifyAmountPage(database, output, pageIndex, includeTotal) {
  const expected = await database.query(
    `SELECT transaction.id,activity."amountAmount"::text AS amount,activity."amountCurrency" AS currency,activity."amountSign" AS sign
     FROM banking_transaction_entity transaction JOIN account_activity_entity activity ON activity.id=transaction."activityId"
     WHERE activity."userId"=$1 AND activity."accountId"=$2
     ORDER BY activity."amountAmount" DESC,COALESCE(transaction."reportingDateOverride",transaction."authorizedDate",activity."providerDate") DESC,
       COALESCE(transaction."authorizedDatetime",activity."providerDatetime") DESC NULLS LAST,transaction.id DESC LIMIT 50 OFFSET $3`,
    [USER, ACCOUNT, pageIndex * 50],
  );
  const actual = output.data.map((row) => ({
    id: row.id,
    amount: String(row.amount.money.amount),
    currency: row.amount.money.currency,
    sign: row.amount.sign,
  }));
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Corrected amount page differs from ordered SQL oracle');
  const [{ count }] = await database.query(
    `SELECT count(*)::int count FROM banking_transaction_entity transaction JOIN account_activity_entity activity ON activity.id=transaction."activityId" WHERE activity."userId"=$1 AND activity."accountId"=$2`,
    [USER, ACCOUNT],
  );
  if (includeTotal && output.total !== count)
    throw new Error('Corrected amount page has incorrect exact total');
  return {
    orderedAmountPageParity: true,
    pageIndex,
    rows: expected.length,
    totalRows: count,
  };
}
function attachAmountPageOracles(workloads, database, services, rows) {
  if (!services.transactionQuery) return;
  for (const workload of workloads) {
    const page = /^transactions\.amount\.page-(\d+)$/.exec(workload.name);
    const cursor = workload.name === 'extended.cursor.amount.deep';
    if (page || cursor)
      workload.verify = (output) =>
        verifyAmountPage(
          database,
          output,
          page ? Number(page[1]) : Math.max(1, Math.floor(rows / 10 / 50) - 2),
          Boolean(page),
        );
  }
}
module.exports = { verifyAmountPage, attachAmountPageOracles };
