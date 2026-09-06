const USER = '10000000-0000-4000-8000-000000000001';
const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function extendedWorkloads(database, s, rows = 10000) {
  const cases = [];
  for (const sortBy of ['activityDate', 'amount', 'merchantName', 'pending']) {
    const pageIndex = Math.max(1, Math.floor(rows / 10 / 50) - 2);
    const options = {
      pageSize: 50,
      sortBy,
      sortOrder: 'DESC',
      accountId: id(101),
    };
    let cursor;
    cases.push({
      name: `extended.cursor.${sortBy}.deep`,
      layer: 'service+postgres',
      policy: 'cursor-count-contract',
      setup: async () => {
        if (s.transactionQuery && !cursor) {
          const previous = await s.transaction.findPage(USER, {
            ...options,
            pageIndex: pageIndex - 1,
            includeTotal: false,
          });
          if (!previous.nextCursor) throw new Error('Deep cursor setup failed');
          cursor = previous.nextCursor;
        }
      },
      call: () =>
        s.transactionQuery
          ? s.transaction.findPage(USER, {
              ...options,
              cursor,
              includeTotal: false,
            })
          : s.transaction.findAllPaginated(USER, { ...options, pageIndex }),
    });
  }
  let backedUp = false;
  let currentCount;
  async function positions(count) {
    if (currentCount === count) return;
    if (!backedUp) {
      await database.query(
        'CREATE TABLE benchmark_positions AS SELECT * FROM investment_holding_snapshot_entity',
      );
      backedUp = true;
    }
    await database.query('DELETE FROM investment_holding_snapshot_entity');
    if (count)
      await database.query(
        `INSERT INTO investment_holding_snapshot_entity SELECT * FROM benchmark_positions WHERE "securityId" IN (SELECT id FROM investment_security_entity ORDER BY id LIMIT $1)`,
        [count],
      );
    if (s.holdingsQuery)
      await database.query(
        `UPDATE holdings_snapshot_header_entity SET "accountValueAmount"=$1 WHERE provider='manual'`,
        [String(count * 10000)],
      );
    currentCount = count;
  }
  for (const count of [0, 10])
    for (const accounts of [1, 20, 100])
      cases.push({
        name: `extended.holdings.${accounts}-accounts.${count}-positions`,
        layer: 'service+postgres',
        policy: 'equivalent',
        setup: () => positions(count),
        call: () =>
          s.read.listInvestmentHoldings(USER, {
            accountIds: Array.from({ length: accounts }, (_, i) => id(i + 1)),
          }),
      });
  for (const count of [0, 10, 100])
    for (const accounts of [1, 20, 100])
      cases.push({
        name: `extended.portfolio.${accounts}-accounts.${count}-positions`,
        layer: 'service+postgres',
        policy: 'equivalent',
        setup: () => positions(count),
        call: () =>
          s.portfolio.visualize(
            USER,
            Array.from({ length: accounts }, (_, i) => id(i + 1)),
          ),
      });
  let mixedPortfolio = false;
  cases.push({
    name: 'extended.portfolio.20-accounts.mixed-currency-dates',
    layer: 'service+postgres',
    policy: 'equivalent',
    setup: async () => {
      if (mixedPortfolio) return;
      await positions(100);
      await database.query(
        `UPDATE investment_holding_snapshot_entity SET "isoCurrencyCode"='EUR',"accountCurrency"='EUR',"snapshotDate"='2026-09-03' WHERE right("accountId"::text,1) IN ('0','2','4','6','8')`,
      );
      if (s.holdingsQuery)
        await database.query(
          `UPDATE holdings_snapshot_header_entity SET "accountCurrency"='EUR',"snapshotDate"='2026-09-03' WHERE "snapshotDate"='2026-09-04' AND right("accountId"::text,1) IN ('0','2','4','6','8')`,
        );
      mixedPortfolio = true;
    },
    call: () =>
      s.portfolio.visualize(
        USER,
        Array.from({ length: 20 }, (_, i) => id(i + 1)),
      ),
  });
  for (const [name, amount] of [
    ['no-match', '1000000'],
    ['rare-match', '99.99'],
  ]) {
    const options = {
      accountIds: [id(101)],
      pageSize: 100,
      reportingCurrency: 'USD',
      amountFilter: {
        currency: 'USD',
        min: s.stringMoney ? amount : Number(amount),
        ...(name === 'rare-match'
          ? { max: s.stringMoney ? amount : Number(amount) }
          : {}),
      },
    };
    cases.push({
      name: `extended.transactions.${name}-amount`,
      layer: 'service+postgres',
      policy: 'bounded-continuation',
      call: () => s.read.listTransactions(USER, options),
      verify: async (first) => {
        const expected = await database.query(
          `SELECT transaction.id FROM banking_transaction_entity transaction JOIN account_activity_entity activity ON activity.id=transaction."activityId" WHERE activity."userId"=$1 AND activity."accountId"=$2 AND transaction.pending=false AND activity."amountCurrency"='USD' AND activity."amountAmount"${name === 'rare-match' ? '=' : '>='}$3 ORDER BY activity."activityDate" DESC,transaction.id DESC`,
          [USER, id(101), name === 'rare-match' ? '9999' : '100000000'],
        );
        const collected = [...first.data];
        const cursors = new Set();
        let page = first;
        while (page.pageInfo.hasMore) {
          const cursor = page.pageInfo.nextCursor;
          if (!cursor || cursors.has(cursor) || cursors.size > 1000)
            throw new Error('Filtered scan cursor did not advance');
          cursors.add(cursor);
          page = await s.read.listTransactions(USER, { ...options, cursor });
          collected.push(...page.data);
        }
        if (
          JSON.stringify(collected.map((row) => row.id)) !==
          JSON.stringify(expected.map((row) => row.id))
        )
          throw new Error(
            'Filtered continuation dropped/repeated/reordered matching transactions',
          );
        return {
          completeContinuationParity: true,
          matchedRows: collected.length,
          calls: 1 + cursors.size,
        };
      },
    });
  }
  for (const accounts of [20, 100])
    cases.push({
      name: `extended.history.ten-years.${accounts}-accounts.compact`,
      layer: 'service+postgres',
      policy: 'compact-resolution',
      call: () =>
        s.history.getBalanceHistorySummary(USER, {
          startDate: '2016-09-07',
          endDate: '2026-09-05',
          accountIds: Array.from({ length: accounts }, (_, i) => id(i + 1)),
          resolution: 'compact',
          maxPoints: 122,
        }),
    });
  return cases;
}
module.exports = { extendedWorkloads };
