const USER = '10000000-0000-4000-8000-000000000001';
const ACCOUNT = '20000000-0000-4000-8000-000000000109';
const LINK = '40000000-0000-4000-8000-000000000001';
const CATEGORY = '50000000-0000-4000-8000-000000000001';
const RULE = '60000000-0000-4000-8000-000000000001';

/** Deterministic provider responses; provider acquisition is outside measured DB apply. */
function syncWorkloads(database, s) {
  const cases = [];
  const money = {
    money: { currency: 'USD', amount: s.stringMoney ? '1000' : 1000 },
    sign: 'negative',
  };
  const mapping = new Map([['synthetic-external', ACCOUNT]]);
  async function ensureFixture(rules) {
    await database.query(
      `INSERT INTO bank_link_entity(id,"userId","providerName",authentication,"accountIds") VALUES($1,$2,'plaid','{}','') ON CONFLICT(id) DO NOTHING`,
      [LINK, USER],
    );
    await database.query(
      `UPDATE account_entity SET "bankLinkId"=$1,"externalAccountId"='synthetic-external',"valuationMode"='balance',type='investment',"subType"='brokerage' WHERE id=$2`,
      [LINK, ACCOUNT],
    );
    await database.query(
      `INSERT INTO category_entity(id,"userId","primary","normalizedPrimary",detailed,"normalizedDetailed",description,color) VALUES($1,$2,'Synthetic','synthetic','Sync','sync','Benchmark category','#336699') ON CONFLICT(id) DO NOTHING`,
      [CATEGORY, USER],
    );
    await database.query(`DELETE FROM categorization_rule_entity WHERE id=$1`, [
      RULE,
    ]);
    if (rules)
      await database.query(
        `INSERT INTO categorization_rule_entity(id,"userId",name,priority,"targetCategoryId",conditions) VALUES($1,$2,'Synthetic sync rule',1,$3,$4::jsonb)`,
        [
          RULE,
          USER,
          CATEGORY,
          JSON.stringify([
            { field: 'merchantName', operator: 'contains', value: 'Synthetic' },
          ]),
        ],
      );
    await database.query(
      `DELETE FROM account_activity_entity WHERE "accountId"=$1 AND "externalActivityId" LIKE 'benchmark-sync-%'`,
      [ACCOUNT],
    );
  }
  for (const count of [50, 500, 5000])
    for (const rules of [false, true]) {
      const added = Array.from({ length: count }, (_, i) => ({
        accountId: 'synthetic-external',
        externalTransactionId: `benchmark-sync-${i}`,
        providerDate: '2026-09-05',
        merchantName: 'Synthetic merchant',
        pending: false,
        amount: money,
      }));
      cases.push({
        name: `sync.banking.${count}.rules-${rules ? 'on' : 'off'}`,
        layer: 'provider-stub-sync-database-apply',
        policy: 'equivalent',
        setup: () => ensureFixture(rules),
        call: () =>
          s.transaction.processSyncResults(USER, mapping, {
            added,
            modified: [],
            removed: [],
            hasMore: false,
            nextCursor: 'synthetic-next',
          }),
        verify: async () => {
          const [row] = await database.query(
            `SELECT count(*)::int count,count(*) FILTER(WHERE transaction."categoryId"=$2)::int categorized FROM account_activity_entity activity JOIN banking_transaction_entity transaction ON transaction."activityId"=activity.id WHERE activity."accountId"=$1 AND activity."externalActivityId" LIKE 'benchmark-sync-%'`,
            [ACCOUNT, CATEGORY],
          );
          if (row.count !== count || row.categorized !== (rules ? count : 0))
            throw new Error(
              'Banking sync persisted count or category mismatch',
            );
        },
      });
    }
  for (const count of [50, 500, 5000])
    for (const rules of [false, true]) {
      const modified = Array.from({ length: count }, (_, i) => ({
        accountId: 'synthetic-external',
        externalTransactionId: `benchmark-sync-${i}`,
        providerDate: '2026-09-05',
        merchantName: 'Synthetic modified merchant',
        pending: false,
        amount: {
          ...money,
          money: { ...money.money, amount: s.stringMoney ? '1100' : 1100 },
        },
      }));
      cases.push({
        name: `sync.banking-modified.${count}.rules-${rules ? 'on' : 'off'}`,
        layer: 'provider-stub-sync-database-apply',
        policy: 'equivalent',
        setup: async () => {
          await ensureFixture(rules);
          await database.query(
            `INSERT INTO account_activity_entity(id,"userId","accountId",provider,"externalActivityId","activityKind","activityDate","providerDate","amountAmount","amountCurrency","amountSign") SELECT md5('modified-activity-'||n)::uuid,$1,$2,'plaid','benchmark-sync-'||n,'banking_transaction','2026-09-05','2026-09-05',1000,'USD','negative' FROM generate_series(0,$3::int-1)n`,
            [USER, ACCOUNT, count],
          );
          await database.query(
            `INSERT INTO banking_transaction_entity(id,"activityId",source,"merchantName",pending) SELECT md5('modified-transaction-'||n)::uuid,md5('modified-activity-'||n)::uuid,'provider','Original merchant',false FROM generate_series(0,$1::int-1)n`,
            [count],
          );
        },
        call: () =>
          s.transaction.processSyncResults(USER, mapping, {
            added: [],
            modified,
            removed: [],
            hasMore: false,
            nextCursor: 'synthetic-next',
          }),
        verify: async () => {
          const [row] = await database.query(
            `SELECT count(*)::int count,count(*) FILTER(WHERE activity."amountAmount"=1100 AND transaction."merchantName"='Synthetic modified merchant')::int modified FROM account_activity_entity activity JOIN banking_transaction_entity transaction ON transaction."activityId"=activity.id WHERE activity."accountId"=$1 AND activity."externalActivityId" LIKE 'benchmark-sync-%'`,
            [ACCOUNT],
          );
          if (row.count !== count || row.modified !== count)
            throw new Error(
              'Modified banking sync persisted an incorrect row/count',
            );
          return { persistedRows: row.count, modifiedRows: row.modified };
        },
      });
    }
  for (const count of [50, 500, 5000]) {
    const transactions = Array.from({ length: count }, (_, i) => ({
      externalActivityId: `benchmark-sync-${i}`,
      externalAccountId: 'synthetic-external',
      externalSecurityId: null,
      providerDate: '2026-09-05',
      providerDatetime: null,
      name: 'Synthetic purchase',
      quantity: '1',
      amount: money,
      price: '10',
      fees: null,
      investmentType: 'buy',
      investmentSubtype: 'buy',
      cancelExternalActivityId: null,
      providerPayload: { synthetic: true },
    }));
    let token;
    cases.push({
      name: `sync.investment-transactions.${count}`,
      layer: 'provider-stub-sync-database-apply',
      policy: 'equivalent',
      setup: async () => {
        await ensureFixture(false);
        token = s.investment.beginProviderSync
          ? await s.investment.beginProviderSync(USER, LINK, 'transactions')
          : undefined;
      },
      call: () =>
        s.investment.upsertPlaidInvestmentTransactions(
          USER,
          mapping,
          {
            externalAccountIds: ['synthetic-external'],
            securities: [],
            transactions,
            startDate: '2026-09-05',
            endDate: '2026-09-05',
          },
          token,
        ),
      verify: async () => {
        const [row] = await database.query(
          `SELECT count(*)::int count FROM account_activity_entity activity JOIN investment_transaction_entity transaction ON transaction."activityId"=activity.id WHERE activity."accountId"=$1 AND activity."externalActivityId" LIKE 'benchmark-sync-%'`,
          [ACCOUNT],
        );
        if (row.count !== count)
          throw new Error('Investment sync persisted pair count mismatch');
      },
    });
  }
  for (const count of [0, 100]) {
    const securities = Array.from({ length: count }, (_, index) => ({
      externalSecurityId: `benchmark-holding-security-${index}`,
      name: 'Synthetic provider security',
      tickerSymbol: `B${index}`,
      type: 'equity',
      isoCurrencyCode: 'USD',
    }));
    const holdings = securities.map((security) => ({
      externalAccountId: 'synthetic-external',
      externalSecurityId: security.externalSecurityId,
      quantity: '1',
      institutionPrice: '10',
      institutionValue: '10',
      isoCurrencyCode: 'USD',
    }));
    let token;
    cases.push({
      name: `sync.holdings.${count}-positions`,
      layer: 'provider-stub-sync-database-apply',
      policy: 'equivalent',
      setup: async () => {
        await ensureFixture(false);
        await database.query(
          `DELETE FROM investment_holding_snapshot_entity WHERE "accountId"=$1`,
          [ACCOUNT],
        );
        if (s.holdingsQuery)
          await database.query(
            `DELETE FROM holdings_snapshot_header_entity WHERE "accountId"=$1`,
            [ACCOUNT],
          );
        if (count)
          await database.query(
            `INSERT INTO investment_security_entity(id,"userId",provider,"externalSecurityId",name,"tickerSymbol",type,"isoCurrencyCode") SELECT md5('benchmark-holding-security-'||n)::uuid,$1,'plaid','benchmark-holding-security-'||n,'Synthetic provider security','B'||n,'equity','USD' FROM generate_series(0,$2::int-1)n ON CONFLICT DO NOTHING`,
            [USER, count],
          );
        token = s.investment.beginProviderSync
          ? await s.investment.beginProviderSync(USER, LINK, 'holdings')
          : undefined;
      },
      call: () =>
        s.investment.upsertPlaidHoldings(
          USER,
          mapping,
          '2026-09-05',
          { externalAccountIds: ['synthetic-external'], securities, holdings },
          token,
        ),
      verify: async () => {
        const [row] = await database.query(
          `SELECT count(*)::int count FROM investment_holding_snapshot_entity WHERE "accountId"=$1 AND "snapshotDate"='2026-09-05'`,
          [ACCOUNT],
        );
        if (row.count !== count)
          throw new Error('Provider holdings snapshot has an incorrect count');
        if (s.holdingsQuery) {
          const [header] = await database.query(
            `SELECT count(*)::int count FROM holdings_snapshot_header_entity WHERE "accountId"=$1 AND "snapshotDate"='2026-09-05'`,
            [ACCOUNT],
          );
          if (header.count !== 1)
            throw new Error('Provider snapshot lacks one completed header');
        }
        return {
          persistedPositions: count,
          completedHeaderChecked: !!s.holdingsQuery,
        };
      },
    });
  }
  return cases;
}
module.exports = { syncWorkloads };
