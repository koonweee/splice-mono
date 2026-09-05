import dayjs from 'dayjs';
import { AccountType } from 'plaid';
import { Repository } from 'typeorm';
import { AccountEntity } from '../../../src/account/account.entity';
import { BalanceSnapshotEntity } from '../../../src/balance-snapshot/balance-snapshot.entity';
import { BalanceQueryService } from '../../../src/balance-query/balance-query.service';
import { DashboardQueryService } from '../../../src/balance-query/dashboard-query.service';
import { CurrencyExchangeService } from '../../../src/currency-exchange/currency-exchange.service';
import { BalanceSnapshotType } from '../../../src/types/BalanceSnapshot';
import {
  MoneySign,
  type SerializedMoneyWithSign,
} from '../../../src/types/MoneyWithSign';
import type { CurrencyPair } from '../../../src/types/ExchangeRate';
import { UserService } from '../../../src/user/user.service';

export const DASHBOARD_FIXTURE_USER_ID = '00000000-0000-4000-8000-000000000001';
export const DASHBOARD_FIXTURE_END_DATE = '2026-09-05';
export function fixtureMoney(
  amount: number,
  currency = 'USD',
): SerializedMoneyWithSign {
  return {
    money: { amount: Math.abs(amount), currency },
    sign: amount < 0 ? MoneySign.NEGATIVE : MoneySign.POSITIVE,
  };
}
export function fixtureAccount(
  index: number,
  type = AccountType.Depository,
): AccountEntity {
  const account = AccountEntity.fromDto(
    {
      name: `Fixture account ${index}`,
      type,
      subType: null,
      currentBalance: fixtureMoney(100000),
      availableBalance: fixtureMoney(100000),
    },
    DASHBOARD_FIXTURE_USER_ID,
  );
  account.id = `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`;
  account.createdAt = new Date('2016-09-07T12:00:00Z');
  account.updatedAt = new Date('2026-09-05T12:00:00Z');
  return account;
}
export function fixtureSnapshot(
  accountId: string,
  date: string,
  amount: number,
  currency = 'USD',
  type = BalanceSnapshotType.SYNC,
): BalanceSnapshotEntity {
  const snapshot = BalanceSnapshotEntity.fromDto(
    {
      accountId,
      snapshotDate: date,
      snapshotType: type,
      currentBalance: fixtureMoney(amount, currency),
      availableBalance: fixtureMoney(amount, currency),
    },
    DASHBOARD_FIXTURE_USER_ID,
  );
  snapshot.id = `${accountId}-${date}`;
  snapshot.createdAt = new Date(`${date}T12:00:00Z`);
  snapshot.updatedAt = new Date(`${date}T12:00:00Z`);
  return snapshot;
}

/** Pure synthetic data, suitable for HTTP fixtures or PostgreSQL insertion. */
export function buildDashboardFixture(count = 20) {
  const accounts = Array.from({ length: count }, (_, index) =>
    fixtureAccount(
      index,
      index % 4 === 3 ? AccountType.Credit : AccountType.Depository,
    ),
  );
  const snapshots: BalanceSnapshotEntity[] = [];
  accounts.forEach((account, index) => {
    if (index === 0) account.archivedAt = new Date('2026-01-01T12:00:00Z');
    if (index === 1) account.valuationMode = 'holdings';
    // Sparse monthly rows plus a prior seed exercise cursor fill-forward.
    for (let month = 0; month <= 120; month++) {
      if (month % 7 === 3) continue;
      const date = dayjs('2016-09-01').add(month, 'month').format('YYYY-MM-DD');
      const currency = index % 3 === 0 ? (month < 55 ? 'JPY' : 'EUR') : 'USD';
      const amount = (index + 1) * 10000 + month * 137;
      snapshots.push(
        fixtureSnapshot(
          account.id,
          date,
          index % 5 === 0 ? -amount : amount,
          currency,
          month % 9 === 4
            ? BalanceSnapshotType.FORWARD_FILL
            : BalanceSnapshotType.SYNC,
        ),
      );
    }
  });
  return { accounts, snapshots };
}

/** Instrumented in-memory repository fixture; requires no Jest globals. */
export function createDashboardFixture(count = 20) {
  const data = buildDashboardFixture(count);
  const reads = { accounts: 0, users: 0, snapshots: 0, rates: 0 };
  const accountRepository = {
    find: async ({ where }: any) => {
      reads.accounts++;
      return data.accounts.filter(
        (account) =>
          account.userId === where.userId &&
          (!where.id || where.id.value.includes(account.id)),
      );
    },
  };
  const snapshotRepository = {
    find: async ({ where }: any) => {
      reads.snapshots++;
      return data.snapshots
        .filter(
          (snapshot) =>
            snapshot.userId === where.userId &&
            where.accountId.value.includes(snapshot.accountId) &&
            snapshot.snapshotDate >= where.snapshotDate.value[0] &&
            snapshot.snapshotDate <= where.snapshotDate.value[1],
        )
        .sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
    },
    createQueryBuilder: () => {
      const parameters: Record<string, any> = {};
      const builder = {
        distinctOn: () => builder,
        where: (_sql: string, values: object) => {
          Object.assign(parameters, values);
          return builder;
        },
        andWhere: (_sql: string, values: object) => {
          Object.assign(parameters, values);
          return builder;
        },
        orderBy: () => builder,
        addOrderBy: () => builder,
        getMany: async () => {
          reads.snapshots++;
          const selected = data.snapshots.filter(
            (snapshot) =>
              snapshot.userId === parameters.userId &&
              parameters.accountIds.includes(snapshot.accountId) &&
              (!parameters.startDate ||
                snapshot.snapshotDate < parameters.startDate) &&
              (!parameters.date || snapshot.snapshotDate <= parameters.date) &&
              (!parameters.forwardFillSnapshotType ||
                snapshot.snapshotType !== parameters.forwardFillSnapshotType),
          );
          selected.sort((a, b) =>
            parameters.forwardFillSnapshotType
              ? b.updatedAt.getTime() - a.updatedAt.getTime()
              : b.snapshotDate.localeCompare(a.snapshotDate),
          );
          return [
            ...new Map(
              selected
                .reverse()
                .map((snapshot) => [snapshot.accountId, snapshot]),
            ).values(),
          ];
        },
      };
      return builder;
    },
  };
  const rates = {
    getRatesForDateRange: async (
      pairs: CurrencyPair[],
      start: string,
      end: string,
    ) => {
      reads.rates++;
      const results: Array<{
        date: string;
        rates: Array<CurrencyPair & { rate: number; source: string }>;
      }> = [];
      for (
        let date = start;
        date <= end;
        date = dayjs(date).add(1, 'day').format('YYYY-MM-DD')
      ) {
        results.push({
          date,
          rates: pairs.map((pair) => ({
            ...pair,
            rate: pair.baseCurrency === 'JPY' ? 0.007 : 1.1,
            source: 'synthetic',
          })),
        });
      }
      return results;
    },
  };
  const users = {
    findOne: async (id: string) => {
      reads.users++;
      return id === DASHBOARD_FIXTURE_USER_ID
        ? { id, settings: { currency: 'USD' } }
        : null;
    },
  };
  const legacy = new BalanceQueryService(
    accountRepository as unknown as Repository<AccountEntity>,
    snapshotRepository as unknown as Repository<BalanceSnapshotEntity>,
    rates as unknown as CurrencyExchangeService,
    users as unknown as UserService,
  );
  return {
    ...data,
    reads,
    accountRepository,
    snapshotRepository,
    rates,
    users,
    legacy,
    dashboard: new DashboardQueryService(legacy),
  };
}
