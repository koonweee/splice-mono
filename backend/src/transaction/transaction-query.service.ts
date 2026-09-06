import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { CalendarDateSchema, assertDateRange } from '../common/query-bounds';
import { canonicalMinorUnits } from '../common/exact-money';
import { TransactionEntity } from './transaction.entity';

export type TransactionQueryFilters = {
  accountId?: string;
  accountIds?: string[];
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  categoryPrimary?: string;
  categoryDetailed?: string;
  amountSign?: string;
  includePending?: boolean;
  merchantQuery?: string;
  minAmount?: string;
  maxAmount?: string;
};
export type TransactionPageOptions = TransactionQueryFilters & {
  pageSize: number;
  pageIndex?: number;
  cursor?: string;
  includeTotal?: boolean;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
};
type SortKey = {
  expression: string;
  direction: 'ASC' | 'DESC';
  nulls: 'NULLS FIRST' | 'NULLS LAST';
  type: 'text' | 'boolean';
};
type Cursor = {
  version: 1;
  scope: string;
  values: Array<string | boolean | null>;
};
type ReadShape = 'list' | 'detail' | 'analysis' | 'mcp' | 'syncIdentity';
const BASE_TRANSACTION_FIELDS = [
  'id',
  'activityId',
  'createdAt',
  'updatedAt',
  'source',
  'merchantName',
  'pending',
  'pendingTransactionId',
  'providerTransactionName',
  'originalDescription',
  'accountOwner',
  'logoUrl',
  'website',
  'merchantEntityId',
  'paymentChannel',
  'transactionCode',
  'personalFinanceCategoryIconUrl',
  'personalFinanceCategoryConfidenceLevel',
  'providerCategoryProvider',
  'providerCategoryPrimary',
  'providerCategoryDetailed',
  'counterparties',
  'location',
  'paymentMeta',
  'authorizedDate',
  'authorizedDatetime',
  'reportingDateOverride',
  'categoryId',
  'categoryUpdatedAt',
  'categoryAssignmentSource',
  'categoryAssignmentRuleId',
];
const MCP_FIELDS = new Set([
  'id',
  'activityId',
  'createdAt',
  'updatedAt',
  'source',
  'merchantName',
  'pending',
  'authorizedDate',
  'authorizedDatetime',
  'reportingDateOverride',
  'categoryId',
  'providerCategoryProvider',
  'providerCategoryPrimary',
  'providerCategoryDetailed',
  'personalFinanceCategoryConfidenceLevel',
  'personalFinanceCategoryIconUrl',
]);
const ACTIVITY_FIELDS = [
  'id',
  'userId',
  'accountId',
  'provider',
  'externalActivityId',
  'activityKind',
  'activityDate',
  'providerDate',
  'providerDatetime',
  'createdAt',
  'updatedAt',
  'amount.amount',
  'amount.currency',
  'amount.sign',
];

@Injectable()
export class TransactionQueryService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly repository: Repository<TransactionEntity>,
  ) {}

  /** Stage financial inputs coherently, then release SQL before caller conversion/formatting. */
  withReadSnapshot<T>(
    reader: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.repository.manager.transaction('REPEATABLE READ', reader);
  }

  /** Shared ownership/filter/projection path; callers receive entities without access to its SQL builder. */
  private query(
    userId: string,
    filters: TransactionQueryFilters,
    shape: ReadShape,
    manager?: EntityManager,
  ): SelectQueryBuilder<TransactionEntity> {
    if (filters.startDate || filters.endDate)
      assertDateRange(
        filters.startDate ?? '0001-01-01',
        filters.endDate ?? '9999-12-31',
      );
    const repo = manager
      ? manager.getRepository(TransactionEntity)
      : this.repository;
    const transactionFields = BASE_TRANSACTION_FIELDS.filter(
      (field) => shape !== 'mcp' || MCP_FIELDS.has(field),
    );
    if (shape === 'detail' || shape === 'syncIdentity')
      transactionFields.push('providerPayload');
    const query = repo
      .createQueryBuilder('transaction')
      .innerJoin(
        'transaction.activity',
        'activity',
        'activity."userId" = :userId AND activity."activityKind" = :kind',
        { userId, kind: 'banking_transaction' },
      )
      .innerJoin('activity.account', 'account', 'account."userId" = :userId', {
        userId,
      })
      .leftJoin(
        'transaction.category',
        'category',
        'category."userId" = :userId OR category."userId" IS NULL',
        { userId },
      )
      .select([
        ...transactionFields.map((field) => `transaction.${field}`),
        ...ACTIVITY_FIELDS.map((field) => `activity.${field}`),
        'account.id',
        'account.name',
        'account.customName',
        'account.type',
        'account.subType',
        'category',
      ])
      .where('activity."userId" = :userId', { userId });
    if (filters.accountId)
      query.andWhere('activity."accountId" = :accountId', {
        accountId: filters.accountId,
      });
    if (filters.accountIds) {
      if (!filters.accountIds.length) query.andWhere('false');
      else
        query.andWhere('activity."accountId" IN (:...accountIds)', {
          accountIds: [...new Set(filters.accountIds)],
        });
    }
    if (filters.startDate)
      query.andWhere('activity."activityDate" >= :startDate', {
        startDate: filters.startDate,
      });
    if (filters.endDate)
      query.andWhere('activity."activityDate" <= :endDate', {
        endDate: filters.endDate,
      });
    if (filters.includePending === false)
      query.andWhere('transaction.pending = false');
    if (filters.amountSign === 'positive' || filters.amountSign === 'negative')
      query.andWhere('activity."amountSign" = :amountSign', {
        amountSign: filters.amountSign,
      });
    if (
      filters.categoryId === 'UNCATEGORIZED' ||
      filters.categoryPrimary === 'UNCATEGORIZED'
    )
      query.andWhere('transaction."categoryId" IS NULL');
    else if (filters.categoryId)
      query.andWhere('transaction."categoryId" = :categoryId', {
        categoryId: filters.categoryId,
      });
    else if (filters.categoryPrimary)
      query.andWhere('category.primary = :categoryPrimary', {
        categoryPrimary: filters.categoryPrimary,
      });
    if (filters.categoryDetailed)
      query.andWhere('category.detailed = :categoryDetailed', {
        categoryDetailed: filters.categoryDetailed,
      });
    const merchant = filters.merchantQuery?.trim();
    if (merchant)
      query.andWhere(
        'transaction."merchantName" ILIKE :merchant ESCAPE \'\\\'',
        { merchant: `%${merchant.replace(/[\\%_]/g, '\\$&')}%` },
      );
    if (filters.minAmount !== undefined)
      query.andWhere('activity."amountAmount" >= :minAmount', {
        minAmount: canonicalMinorUnits(filters.minAmount),
      });
    if (filters.maxAmount !== undefined)
      query.andWhere('activity."amountAmount" <= :maxAmount', {
        maxAmount: canonicalMinorUnits(filters.maxAmount),
      });
    return query;
  }

  readAnalysis(
    userId: string,
    startDate: string,
    endDate: string,
    manager?: EntityManager,
  ): Promise<TransactionEntity[]> {
    return this.query(
      userId,
      { startDate, endDate },
      'analysis',
      manager,
    ).getMany();
  }

  async readDetail(
    userId: string,
    id: string,
    manager?: EntityManager,
  ): Promise<TransactionEntity> {
    const result = await this.query(userId, {}, 'detail', manager)
      .andWhere('transaction.id = :id', { id })
      .getOne();
    if (!result) throw new NotFoundException('Transaction not found');
    return result;
  }

  readMcpCandidates(
    userId: string,
    filters: TransactionQueryFilters,
    cursor: { activityDate: string; id: string } | undefined,
    limit: number,
    manager?: EntityManager,
  ): Promise<TransactionEntity[]> {
    const query = this.query(userId, filters, 'mcp', manager);
    if (cursor)
      query.andWhere(
        '(activity."activityDate" < :cursorDate OR (activity."activityDate" = :cursorDate AND transaction.id < :cursorId))',
        { cursorDate: cursor.activityDate, cursorId: cursor.id },
      );
    return query
      .orderBy('activity."activityDate"', 'DESC')
      .addOrderBy('transaction.id', 'DESC')
      .limit(Math.min(limit, 5001))
      .getMany();
  }

  readSyncIdentities(
    userId: string,
    accountIds: string[],
    externalIds: string[],
    manager: EntityManager,
  ): Promise<TransactionEntity[]> {
    if (!externalIds.length || !accountIds.length) return Promise.resolve([]);
    return this.query(userId, { accountIds }, 'syncIdentity', manager)
      .andWhere('activity.provider = :provider', { provider: 'plaid' })
      .andWhere(
        '(activity."externalActivityId" IN (:...externalIds) OR transaction."pendingTransactionId" IN (:...externalIds))',
        { externalIds: [...new Set(externalIds)] },
      )
      .setLock('pessimistic_write', undefined, ['transaction', 'activity'])
      .getMany();
  }

  async readRemovalActivityIds(
    userId: string,
    accountIds: string[],
    externalIds: string[],
    manager: EntityManager,
  ): Promise<string[]> {
    if (!externalIds.length || !accountIds.length) return [];
    const rows = await this.query(
      userId,
      { accountIds },
      'syncIdentity',
      manager,
    )
      .select('transaction."activityId"', 'activityId')
      .andWhere(
        'transaction.source = :source AND activity.provider = :provider',
        { source: 'provider', provider: 'plaid' },
      )
      .andWhere('activity."externalActivityId" IN (:...externalIds)', {
        externalIds,
      })
      .getRawMany<{ activityId: string }>();
    return rows.map((row) => row.activityId);
  }

  async search(
    userId: string,
    filters: TransactionQueryFilters,
    limit = 20,
    manager?: EntityManager,
  ): Promise<{ entities: TransactionEntity[]; total: number }> {
    const query = this.query(userId, filters, 'list', manager);
    const [entities, total] = await Promise.all([
      this.order(query.clone(), 'activityDate', 'DESC')
        .limit(Math.min(100, Math.max(1, limit)))
        .getMany(),
      query.getCount(),
    ]);
    return { entities, total };
  }

  async readPage(
    userId: string,
    options: TransactionPageOptions,
    manager?: EntityManager,
  ): Promise<{
    entities: TransactionEntity[];
    total: number | null;
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    if (
      !Number.isInteger(options.pageSize) ||
      options.pageSize < 1 ||
      options.pageSize > 100
    )
      throw new BadRequestException('pageSize must be 1–100');
    if (
      options.pageIndex !== undefined &&
      (!Number.isSafeInteger(options.pageIndex * options.pageSize) ||
        options.pageIndex < 0)
    )
      throw new BadRequestException('pageIndex must be a nonnegative integer');
    const sortBy = [
      'activityDate',
      'merchantName',
      'pending',
      'amount',
    ].includes(options.sortBy ?? '')
      ? options.sortBy!
      : 'activityDate';
    const order = options.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const keys = this.sortKeys(sortBy, order);
    const filters = Object.fromEntries(
      [
        'accountId',
        'accountIds',
        'startDate',
        'endDate',
        'categoryId',
        'categoryPrimary',
        'categoryDetailed',
        'amountSign',
        'includePending',
        'merchantQuery',
        'minAmount',
        'maxAmount',
      ].map((key) => [key, options[key as keyof TransactionQueryFilters]]),
    );
    const scope = createHash('sha256')
      .update(JSON.stringify({ userId, filters, sortBy, order }))
      .digest('hex');
    const base = this.query(userId, options, 'list', manager);
    const query = this.order(base.clone(), sortBy, order);
    keys.forEach((key, index) =>
      query.addSelect(`${key.expression}::text`, `cursor_${index}`),
    );
    if (options.cursor)
      this.seek(query, keys, this.decodeCursor(options.cursor, scope, keys));
    else if (options.pageIndex)
      query.offset(options.pageIndex * options.pageSize);
    query.limit(options.pageSize + 1);
    const [page, total] = await Promise.all([
      query.getRawAndEntities(),
      (options.includeTotal ?? !options.cursor)
        ? base.getCount()
        : Promise.resolve(null),
    ]);
    const hasMore = page.entities.length > options.pageSize;
    const entities = page.entities.slice(0, options.pageSize);
    let nextCursor: string | null = null;
    if (hasMore && entities.length) {
      const raw = page.raw[entities.length - 1] as Record<string, unknown>;
      const values = keys.map((key, index) =>
        raw[`cursor_${index}`] === null
          ? null
          : key.type === 'boolean'
            ? raw[`cursor_${index}`] === 'true'
            : String(raw[`cursor_${index}`]),
      );
      nextCursor = Buffer.from(
        JSON.stringify({ version: 1, scope, values } satisfies Cursor),
      ).toString('base64url');
    }
    return { entities, total, nextCursor, hasMore };
  }

  private sortKeys(sortBy: string, order: 'ASC' | 'DESC'): SortKey[] {
    const chronological = sortBy === 'activityDate' ? order : 'DESC';
    const primary =
      sortBy === 'amount'
        ? 'activity."amountAmount"'
        : sortBy === 'activityDate'
          ? 'activity."activityDate"'
          : `transaction."${sortBy}"`;
    const keys: SortKey[] = [
      {
        expression: primary,
        direction: order,
        nulls: order === 'ASC' ? 'NULLS LAST' : 'NULLS FIRST',
        type: sortBy === 'pending' ? 'boolean' : 'text',
      },
    ];
    if (sortBy !== 'activityDate')
      keys.push({
        expression: 'activity."activityDate"',
        direction: 'DESC',
        nulls: 'NULLS LAST',
        type: 'text',
      });
    keys.push(
      {
        expression:
          'COALESCE(transaction."authorizedDatetime", activity."providerDatetime")',
        direction: chronological,
        nulls: 'NULLS LAST',
        type: 'text',
      },
      {
        expression: 'transaction.id',
        direction: chronological,
        nulls: 'NULLS LAST',
        type: 'text',
      },
    );
    return keys;
  }

  private order(
    query: SelectQueryBuilder<TransactionEntity>,
    sortBy: string,
    order: 'ASC' | 'DESC',
  ) {
    this.sortKeys(sortBy, order).forEach((key, index) =>
      index === 0
        ? query.orderBy(key.expression, key.direction, key.nulls)
        : query.addOrderBy(key.expression, key.direction, key.nulls),
    );
    return query;
  }

  private decodeCursor(
    encoded: string,
    scope: string,
    keys: SortKey[],
  ): Cursor {
    try {
      if (encoded.length > 4096) throw new Error();
      const cursor = JSON.parse(
        Buffer.from(encoded, 'base64url').toString(),
      ) as Cursor;
      if (
        cursor.version !== 1 ||
        cursor.scope !== scope ||
        !Array.isArray(cursor.values) ||
        cursor.values.length !== keys.length ||
        cursor.values.some(
          (value) =>
            value !== null &&
            typeof value !== 'string' &&
            typeof value !== 'boolean',
        )
      )
        throw new Error();
      cursor.values.forEach((value, index) => {
        const key = keys[index];
        if (value === null) {
          if (
            !key.expression.includes('Datetime') &&
            !key.expression.includes('merchantName')
          )
            throw new Error();
        } else if (key.type === 'boolean') {
          if (typeof value !== 'boolean') throw new Error();
        } else {
          if (typeof value !== 'string' || value.length > 2048)
            throw new Error();
          if (key.expression.includes('activityDate'))
            CalendarDateSchema.parse(value);
          if (
            key.expression.includes('amountAmount') &&
            canonicalMinorUnits(value) !== value
          )
            throw new Error();
          if (
            key.expression.includes('Datetime') &&
            (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(
              value,
            ) ||
              !Number.isFinite(Date.parse(value)))
          )
            throw new Error();
          if (
            key.expression === 'transaction.id' &&
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              value,
            )
          )
            throw new Error();
        }
      });
      return cursor;
    } catch {
      throw new BadRequestException(
        'Cursor is invalid or belongs to a different filter/sort; restart pagination',
      );
    }
  }

  private seek(
    query: SelectQueryBuilder<TransactionEntity>,
    keys: SortKey[],
    cursor: Cursor,
  ) {
    const clauses: string[] = [];
    keys.forEach((key, index) => {
      const value = cursor.values[index];
      const prefix = keys
        .slice(0, index)
        .map(
          (previous, i) =>
            `${previous.expression} IS NOT DISTINCT FROM :cursor${i}`,
        );
      const after =
        value === null
          ? key.nulls === 'NULLS FIRST'
            ? `${key.expression} IS NOT NULL`
            : 'false'
          : `(${key.expression} ${key.direction === 'ASC' ? '>' : '<'} :cursor${index}${key.nulls === 'NULLS LAST' ? ` OR ${key.expression} IS NULL` : ''})`;
      clauses.push(`(${[...prefix, after].join(' AND ')})`);
      query.setParameter(`cursor${index}`, value);
    });
    query.andWhere(`(${clauses.join(' OR ')})`);
  }
}
