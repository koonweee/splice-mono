const USER = '10000000-0000-4000-8000-000000000001';
const ACCOUNT = '20000000-0000-4000-8000-000000000101';
const CATEGORY = '50000000-0000-4000-8000-000000000002';

function filterWorkloads(database, services) {
  let seeded = false;
  async function setup() {
    if (seeded) return;
    await database.query(
      `INSERT INTO category_entity(id,"userId","primary","normalizedPrimary",detailed,"normalizedDetailed",description,color,"createdAt","updatedAt") VALUES($1,$2,'Synthetic filter','synthetic filter','Benchmark','benchmark','Synthetic benchmark category','#336699',$3,$3)`,
      [CATEGORY, USER, '2026-09-05T12:00:00.000Z'],
    );
    await database.query(
      `UPDATE banking_transaction_entity transaction SET "categoryId"=$1 FROM account_activity_entity activity WHERE activity.id=transaction."activityId" AND activity."userId"=$2 AND activity."accountId"=$3 AND transaction."merchantName" IN ('Merchant 0','Merchant 20','Merchant 40','Merchant 60','Merchant 80')`,
      [CATEGORY, USER, ACCOUNT],
    );
    await database.query('ANALYZE banking_transaction_entity');
    seeded = true;
  }
  return [
    ['category', { categoryId: CATEGORY }],
    ['uncategorized', { categoryId: 'UNCATEGORIZED' }],
    [
      'date-account-category',
      {
        accountId: ACCOUNT,
        categoryId: CATEGORY,
        startDate: '2026-08-01',
        endDate: '2026-09-05',
      },
    ],
  ].map(([name, filters]) => ({
    name: `transactions.filter.${name}`,
    layer: 'service+postgres',
    policy: 'equivalent',
    setup,
    call: () =>
      services.transaction.findAllPaginated(USER, {
        pageIndex: 0,
        pageSize: 50,
        sortBy: 'activityDate',
        sortOrder: 'DESC',
        ...filters,
      }),
  }));
}
module.exports = { filterWorkloads };
