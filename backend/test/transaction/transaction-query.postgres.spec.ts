import { randomUUID } from 'node:crypto';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';
import { TransactionQueryService } from '../../src/transaction/transaction-query.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { UserEntity } from '../../src/user/user.entity';
import { AccountEntity } from '../../src/account/account.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';

postgresSuite(
  'Shared transaction reads and cursor invariants in PostgreSQL',
  () => {
    let harness: Awaited<ReturnType<typeof isolatedPostgres>>;
    let queries: TransactionQueryService;
    let userId: string;
    let accountId: string;
    let foreignUser: string;
    beforeAll(async () => {
      harness = await isolatedPostgres('transaction_queries');
      const database = harness.database;
      const user = await database.getRepository(UserEntity).save(
        UserEntity.fromGoogleIdentity({
          email: `${randomUUID()}@example.test`,
          googleSubject: randomUUID(),
        }),
      );
      userId = user.id;
      const other = await database.getRepository(UserEntity).save(
        UserEntity.fromGoogleIdentity({
          email: `${randomUUID()}@example.test`,
          googleSubject: randomUUID(),
        }),
      );
      foreignUser = other.id;
      const money = {
        money: { amount: '0', currency: 'USD' },
        sign: MoneySign.POSITIVE,
      };
      const account = await database.getRepository(AccountEntity).save(
        AccountEntity.fromDto(
          {
            name: 'Synthetic',
            type: 'depository',
            currentBalance: money,
            availableBalance: money,
          } as any,
          userId,
        ),
      );
      accountId = account.id;
      for (let index = 0; index < 35; index++) {
        const id = randomUUID();
        await database.query(
          `INSERT INTO account_activity_entity (id,"userId","accountId",provider,"externalActivityId","activityKind","activityDate","providerDate","providerDatetime","amountAmount","amountCurrency","amountSign") VALUES ($1,$2,$3,'plaid',$4,'banking_transaction','2026-09-05','2026-09-05',$5,$6,'USD','negative')`,
          [
            id,
            userId,
            accountId,
            `txn-${index}`,
            index % 3
              ? `2026-09-05T12:00:00.${String(index).padStart(6, '0')}Z`
              : null,
            (900719925474099300n + BigInt(index % 4)).toString(),
          ],
        );
        await database.query(
          `INSERT INTO banking_transaction_entity ("activityId",source,"merchantName",pending,"providerPayload") VALUES ($1,'provider',$2,$3,$4::jsonb)`,
          [
            id,
            index % 5 ? `Merchant ${index % 3}` : null,
            index % 2 === 0,
            JSON.stringify({ unused: 'x'.repeat(10000) }),
          ],
        );
      }
      queries = new TransactionQueryService(
        database.getRepository(TransactionEntity),
      );
    }, 120000);
    afterAll(async () => {
      await harness?.close();
    });

    it.each(
      ['activityDate', 'merchantName', 'pending', 'amount'].flatMap((sortBy) =>
        ['ASC', 'DESC'].map((sortOrder) => ({
          sortBy,
          sortOrder: sortOrder as 'ASC' | 'DESC',
        })),
      ),
    )(
      'preserves $sortBy $sortOrder ordering with exact ties, nulls and microseconds',
      async (options) => {
        const whole = await queries.readPage(userId, {
          ...options,
          pageSize: 100,
        });
        const found: string[] = [];
        let cursor: string | undefined;
        let page = 0;
        do {
          harness.queries.length = 0;
          const result = await queries.readPage(userId, {
            ...options,
            pageSize: 4,
            cursor,
          });
          expect(
            harness.queries.filter((sql) => /^SELECT/i.test(sql)),
          ).toHaveLength(page === 0 ? 2 : 1);
          expect(result.total).toBe(page === 0 ? 35 : null);
          found.push(...result.entities.map((item) => item.id));
          expect(
            result.entities.every((item) => item.providerPayload === undefined),
          ).toBe(true);
          cursor = result.nextCursor ?? undefined;
          page++;
          expect(page).toBeLessThan(15);
        } while (cursor);
        expect(found).toEqual(whole.entities.map((item) => item.id));
        expect(new Set(found).size).toBe(35);
      },
    );

    it('rejects cross-user/filter cursors and invalid calendar dates', async () => {
      const first = await queries.readPage(userId, { pageSize: 5 });
      await expect(
        queries.readPage(foreignUser, {
          pageSize: 5,
          cursor: first.nextCursor!,
        }),
      ).rejects.toThrow('Cursor');
      await expect(
        queries.readPage(userId, {
          pageSize: 5,
          cursor: first.nextCursor!,
          amountSign: 'positive',
        }),
      ).rejects.toThrow('Cursor');
      await expect(
        queries.readPage(userId, { pageSize: 5, startDate: '2026-02-30' }),
      ).rejects.toThrow('calendar');
      expect(
        (await queries.readPage(foreignUser, { pageSize: 5 })).entities,
      ).toHaveLength(0);
    });

    it('has no continuation on a full final page and uses exact numeric amount bounds', async () => {
      const first = await queries.readPage(userId, { pageSize: 35 });
      expect(first.hasMore).toBe(false);
      expect(first.nextCursor).toBeNull();
      const result = await queries.search(
        userId,
        { minAmount: '900719925474099302', maxAmount: '900719925474099302' },
        2,
      );
      expect(result.entities).toHaveLength(2);
      expect(result.total).toBe(9);
      expect(
        result.entities.every(
          (item) => item.amount.amount === '900719925474099302',
        ),
      ).toBe(true);
    });

    it('keeps persisted reporting dates correct for banking and provider-side writes', async () => {
      const entity = (await queries.readPage(userId, { pageSize: 1 }))
        .entities[0];
      await harness.database.query(
        `UPDATE banking_transaction_entity SET "reportingDateOverride"='2026-08-01' WHERE id=$1`,
        [entity.id],
      );
      const report = await queries.readAnalysis(
        userId,
        '2026-08-01',
        '2026-08-01',
      );
      expect(report.map((item) => item.id)).toEqual([entity.id]);
      await harness.database.query(
        `UPDATE account_activity_entity SET "providerDate"='2026-07-01',"activityDate"='1990-01-01' WHERE id=$1`,
        [entity.activityId],
      );
      expect(
        (await queries.readDetail(userId, entity.id)).activity.activityDate,
      ).toBe('2026-08-01');
      await harness.database.query(
        `UPDATE banking_transaction_entity SET "reportingDateOverride"=NULL,"authorizedDate"=NULL WHERE id=$1`,
        [entity.id],
      );
      expect(
        (await queries.readDetail(userId, entity.id)).activity.activityDate,
      ).toBe('2026-07-01');
    });
  },
);
