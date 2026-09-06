import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { assertDateRange } from '../common/query-bounds';
import { AccountEntity } from '../account/account.entity';
import type { InvestmentHoldingsResponse } from '../types/Investment';
import { HoldingsSnapshotHeaderEntity } from './holdings-snapshot-header.entity';
import { InvestmentHoldingSnapshotEntity } from './investment-holding-snapshot.entity';

export type HoldingsReadOptions = {
  accountIds?: string[];
  snapshotDate?: string;
  includeArchived?: boolean;
};
export type HoldingsReadResult = {
  account: AccountEntity;
  snapshot: InvestmentHoldingsResponse;
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
    if (options.snapshotDate)
      assertDateRange(options.snapshotDate, options.snapshotDate);
    if (options.accountIds?.length === 0) return [];
    if (manager) return this.readSnapshot(manager, userId, options);
    return this.dataSource.transaction('REPEATABLE READ', (scoped) =>
      this.readSnapshot(scoped, userId, options),
    );
  }

  private async readSnapshot(
    manager: EntityManager,
    userId: string,
    options: HoldingsReadOptions,
  ): Promise<HoldingsReadResult[]> {
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
      headersQuery.andWhere('header."snapshotDate" = :snapshotDate', {
        snapshotDate: options.snapshotDate,
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
