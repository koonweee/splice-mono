import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { assertDateRange } from '../common/query-bounds';
import { AccountEntity } from '../account/account.entity';
import type { InvestmentHoldingsResponse } from '../types/Investment';
import { HoldingsSnapshotHeaderEntity } from './holdings-snapshot-header.entity';
import { InvestmentHoldingSnapshotEntity } from './investment-holding-snapshot.entity';

export type HoldingsReadOptions = {
  accountIds?: string[];
  snapshotDate?: string;
  dateMode?: 'exact' | 'on_or_before';
  minSnapshotDate?: string;
  includeArchived?: boolean;
};
export type HoldingsReadResult = {
  account: AccountEntity;
  snapshot: InvestmentHoldingsResponse;
  header?: HoldingsSnapshotHeaderEntity;
};

@Injectable()
export class HoldingsQueryService {
  constructor(private readonly dataSource: DataSource) {}

  /** All three reads share one database snapshot; a caller's locked transaction can be reused. */
  async read(
    userId: string,
    options: HoldingsReadOptions = {},
    manager?: EntityManager,
  ): Promise<HoldingsReadResult[]> {
    if (options.dateMode && !options.snapshotDate)
      throw new BadRequestException('dateMode requires snapshotDate');
    if (options.snapshotDate)
      assertDateRange(options.snapshotDate, options.snapshotDate);
    if (
      options.dateMode === 'on_or_before' &&
      (!options.snapshotDate || !options.minSnapshotDate)
    )
      throw new BadRequestException(
        'on_or_before requires snapshotDate and minSnapshotDate',
      );
    if (options.minSnapshotDate) {
      if (!options.snapshotDate)
        throw new BadRequestException('minSnapshotDate requires snapshotDate');
      assertDateRange(options.minSnapshotDate, options.snapshotDate, {
        maxDays: 3660,
      });
    }
    if (options.accountIds?.length === 0) return [];
    if (manager) return this.readSnapshot(manager, userId, options);
    return this.dataSource.transaction('REPEATABLE READ', (scoped) =>
      this.readSnapshot(scoped, userId, options),
    );
  }

  async listAvailableDates(
    userId: string,
    options: {
      accountIds?: string[];
      startDate: string;
      endDate: string;
      limit?: number;
    },
  ) {
    assertDateRange(options.startDate, options.endDate, { maxDays: 3660 });
    const limit = options.limit ?? 500;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new BadRequestException('limit must be between 1 and 1000');
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      const accounts = await this.loadAccounts(manager, userId, {
        accountIds: options.accountIds,
        snapshotDate: options.endDate,
      });
      const ids = accounts.map((account) => account.id);
      if (ids.length === 0)
        return { data: [], truncated: false, limit, query: options };
      const headers = await manager
        .getRepository(HoldingsSnapshotHeaderEntity)
        .createQueryBuilder('header')
        .innerJoin(
          AccountEntity,
          'owner',
          'owner.id = header."accountId" AND owner."userId" = header."userId"',
        )
        .where('header."userId" = :userId', { userId })
        .andWhere('header."accountId" IN (:...ids)', { ids })
        .andWhere(
          `header.provider = CASE WHEN owner."valuationMode" = 'holdings' THEN 'manual' ELSE 'plaid' END`,
        )
        .andWhere(
          'header."snapshotDate" BETWEEN :startDate AND :endDate',
          options,
        )
        .orderBy('header.snapshotDate', 'ASC')
        .addOrderBy('header.accountId', 'ASC')
        .take(limit + 1)
        .getMany();
      return {
        data: headers.slice(0, limit).map((header) => ({
          accountId: header.accountId,
          snapshotId: header.id,
          snapshotDate: header.snapshotDate,
          provider: header.provider,
          revision: header.revision,
          completedAt: header.completedAt.toISOString(),
        })),
        truncated: headers.length > limit,
        limit,
        query: options,
      };
    });
  }

  private async loadAccounts(
    manager: EntityManager,
    userId: string,
    options: HoldingsReadOptions,
  ): Promise<AccountEntity[]> {
    const query = manager
      .getRepository(AccountEntity)
      .createQueryBuilder('account')
      .select([
        'account.id',
        'account.userId',
        'account.name',
        'account.customName',
        'account.notes',
        'account.mask',
        'account.type',
        'account.subType',
        'account.valuationMode',
        'account.externalAccountId',
        'account.bankLinkId',
        'account.archivedAt',
        'account.createdAt',
        'account.updatedAt',
        'account.currentBalance.amount',
        'account.currentBalance.currency',
        'account.currentBalance.sign',
        'account.availableBalance.amount',
        'account.availableBalance.currency',
        'account.availableBalance.sign',
      ])
      .where('account."userId" = :userId', { userId })
      .orderBy('account.id', 'ASC');
    if (!options.includeArchived)
      query.andWhere('account."archivedAt" IS NULL');
    if (options.accountIds)
      query.andWhere('account.id IN (:...accountIds)', {
        accountIds: [...new Set(options.accountIds)],
      });
    else
      query.andWhere('account.type IN (:...types)', {
        types: ['investment', 'brokerage'],
      });
    const accounts = await query.getMany();
    if (
      options.accountIds &&
      accounts.length !== new Set(options.accountIds).size
    )
      throw new NotFoundException(
        'One or more investment accounts were not found',
      );
    return accounts;
  }

  private async readSnapshot(
    manager: EntityManager,
    userId: string,
    options: HoldingsReadOptions,
  ): Promise<HoldingsReadResult[]> {
    const accounts = await this.loadAccounts(manager, userId, options);
    if (accounts.length === 0) return [];
    const headersQuery = manager
      .getRepository(HoldingsSnapshotHeaderEntity)
      .createQueryBuilder('header')
      .innerJoin(
        AccountEntity,
        'owner',
        'owner.id = header."accountId" AND owner."userId" = header."userId"',
      )
      .where('header."userId" = :userId', { userId })
      .andWhere('header."accountId" IN (:...accountIds)', {
        accountIds: accounts.map((account) => account.id),
      })
      .andWhere(
        `header.provider = CASE WHEN owner."valuationMode" = 'holdings' THEN 'manual' ELSE 'plaid' END`,
      )
      .distinctOn(['header.accountId'])
      .orderBy('header.accountId', 'ASC')
      .addOrderBy('header.snapshotDate', 'DESC')
      .addOrderBy('header.revision', 'DESC');
    if (options.snapshotDate)
      headersQuery.andWhere(
        `header."snapshotDate" ${options.dateMode === 'on_or_before' ? '<=' : '='} :snapshotDate`,
        {
          snapshotDate: options.snapshotDate,
        },
      );
    if (options.minSnapshotDate)
      headersQuery.andWhere('header."snapshotDate" >= :minSnapshotDate', {
        minSnapshotDate: options.minSnapshotDate,
      });
    const headers = await headersQuery.getMany();
    const holdings = headers.length
      ? await manager
          .getRepository(InvestmentHoldingSnapshotEntity)
          .createQueryBuilder('holding')
          .innerJoinAndSelect(
            'holding.security',
            'security',
            'security."userId" = :userId',
            { userId },
          )
          .where('holding."userId" = :userId', { userId })
          .andWhere('holding."headerId" IN (:...headerIds)', {
            headerIds: headers.map((header) => header.id),
          })
          .orderBy('holding.institutionValue', 'DESC', 'NULLS LAST')
          .addOrderBy('holding.id', 'ASC')
          .getMany()
      : [];
    const headerByAccount = new Map(
      headers.map((header) => [header.accountId, header]),
    );
    const holdingsByHeader = new Map<
      string,
      InvestmentHoldingSnapshotEntity[]
    >();
    for (const holding of holdings) {
      const group = holdingsByHeader.get(holding.headerId) ?? [];
      group.push(holding);
      holdingsByHeader.set(holding.headerId, group);
    }
    return accounts.map((account) => {
      const header = headerByAccount.get(account.id);
      const accountValue =
        header?.accountCurrency &&
        header.accountValueAmount !== null &&
        header.accountValueSign
          ? {
              money: {
                currency: header.accountCurrency,
                amount: header.accountValueAmount,
              },
              sign: header.accountValueSign,
            }
          : null;
      return {
        account,
        header,
        snapshot: {
          accountId: account.id,
          snapshotDate: header?.snapshotDate ?? null,
          accountCurrency:
            header?.accountCurrency ??
            (account.valuationMode === 'holdings'
              ? account.currentBalance.currency
              : null),
          accountValue,
          holdings: header
            ? (holdingsByHeader.get(header.id) ?? []).map((holding) =>
                holding.toObject(),
              )
            : [],
        },
      };
    });
  }
}
