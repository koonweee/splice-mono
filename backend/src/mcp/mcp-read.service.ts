import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import {
  formatAccountLabel,
  getAccountGrouping,
  getAccountGroupingLabel,
  type AccountGrouping,
} from '../account/account-labels';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { CategoryEntity } from '../category/category.entity';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import {
  getTransactionActivityDate,
  TRANSACTION_ACTIVITY_DATE_EXPRESSION,
} from '../transaction/transaction-date';
import { TransactionEntity } from '../transaction/transaction.entity';
import {
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';
import { toMcpMoney, type McpMoney } from './mcp-money';

const TRANSACTION_DEFAULT_PAGE_SIZE = 50;
const TRANSACTION_MAX_PAGE_SIZE = 100;
const SNAPSHOT_DEFAULT_PAGE_SIZE = 100;
const SNAPSHOT_MAX_PAGE_SIZE = 250;
const CANDIDATE_BATCH_SIZE = 250;
const ACTIVITY_DATE_SORT_ALIAS = 'activity_date_sort';

interface CursorPayload {
  date: string;
  id: string;
}

interface TransactionCursorPayload {
  activityDate: string;
  id: string;
}

export interface McpPageInfo {
  nextCursor: string | null;
  hasMore: boolean;
}

export interface McpConversionRate {
  from: string;
  to: string;
  rate: number;
  rateDate: string;
}

export interface McpConversionMetadata {
  reportingCurrency: string;
  rates: McpConversionRate[];
}

export interface McpAmountFilter {
  min?: number;
  max?: number;
  currency: string;
}

export interface McpListTransactionsOptions {
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  categoryPrimary?: string;
  merchantQuery?: string;
  includePending?: boolean;
  cursor?: string;
  pageSize?: number;
  reportingCurrency: string;
  amountFilter?: McpAmountFilter;
}

export interface McpTransaction {
  id: string;
  accountId: string;
  accountName: string;
  merchantName: string | null;
  pending: boolean;
  activityDate: string;
  reportingDateOverride: string | null;
  providerDate: string;
  providerDatetime: string | null;
  authorizedDate: string | null;
  categoryPrimary: string | null;
  categoryPrimaryLabel: string;
  categoryDetailed: string | null;
  categoryDetailedLabel: string | null;
  providerCategoryHint: {
    provider: 'plaid';
    primary: string | null;
    detailed: string | null;
    displayLabel: string | null;
    confidenceLevel: string | null;
    iconUrl: string | null;
  } | null;
  amount: McpMoney;
  convertedAmount: McpMoney;
}

export interface McpListTransactionsResult {
  data: McpTransaction[];
  pageInfo: McpPageInfo;
  conversion: McpConversionMetadata;
  query: {
    startDate?: string;
    endDate?: string;
    includePending: boolean;
    reportingCurrency: string;
    amountFilter?: McpAmountFilter;
  };
}

export interface McpListBalanceSnapshotsOptions {
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  cursor?: string;
  pageSize?: number;
}

export interface McpBalanceSnapshot {
  id: string;
  accountId: string;
  accountName: string;
  accountType: string;
  accountTypeLabel: string;
  accountSubType: string | null;
  accountSubTypeLabel: string | null;
  grouping: AccountGrouping;
  groupingLabel: string;
  institutionName: string | null;
  snapshotDate: string;
  snapshotType: string;
  currentBalance: McpMoney;
  availableBalance: McpMoney;
}

export interface McpListBalanceSnapshotsResult {
  data: McpBalanceSnapshot[];
  pageInfo: McpPageInfo;
  query: {
    startDate?: string;
    endDate?: string;
  };
}

export interface McpListCategoriesOptions {
  startDate?: string;
  endDate?: string;
}

export interface McpCategory {
  primary: string;
  primaryLabel: string;
  description: string | null;
  detailedCategories: Array<{
    detailed: string;
    detailedLabel: string;
    description: string;
  }>;
  transactionCount?: number;
}

export interface McpListCategoriesResult {
  data: McpCategory[];
  query: {
    startDate?: string;
    endDate?: string;
  };
}

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function formatCategoryLabel(rawLabel: string | null): string {
  return (rawLabel ?? 'UNCATEGORIZED')
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function encodeCursor(
  payload: CursorPayload | TransactionCursorPayload,
): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): CursorPayload | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<CursorPayload>;
    if (typeof parsed.date === 'string' && typeof parsed.id === 'string') {
      return { date: parsed.date, id: parsed.id };
    }
  } catch {
    // Throw below with a stable client-facing message.
  }

  throw new BadRequestException('Invalid cursor.');
}

function decodeTransactionCursor(
  cursor: string | undefined,
): TransactionCursorPayload | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<TransactionCursorPayload & CursorPayload>;
    if (
      typeof parsed.activityDate === 'string' &&
      typeof parsed.id === 'string'
    ) {
      return { activityDate: parsed.activityDate, id: parsed.id };
    }
    if (typeof parsed.date === 'string' && typeof parsed.id === 'string') {
      return { activityDate: parsed.date, id: parsed.id };
    }
  } catch {
    // Throw below with a stable client-facing message.
  }

  throw new BadRequestException('Invalid cursor.');
}

function clampPageSize(
  pageSize: number | undefined,
  defaultPageSize: number,
  maxPageSize: number,
): number {
  return Math.min(Math.max(pageSize ?? defaultPageSize, 1), maxPageSize);
}

function convertMoney(
  money: SerializedMoneyWithSign,
  targetCurrency: string,
  rate: number,
  currencyConversionService: CurrencyConversionService,
): SerializedMoneyWithSign {
  if (money.money.currency === targetCurrency) {
    return {
      money: { amount: money.money.amount, currency: targetCurrency },
      sign: money.sign,
    };
  }

  return {
    money: {
      amount: currencyConversionService.convertAmount(
        money.money.amount,
        money.money.currency,
        targetCurrency,
        rate,
      ),
      currency: targetCurrency,
    },
    sign: money.sign,
  };
}

function signedMajorAmount(money: McpMoney): number {
  return money.sign === MoneySign.NEGATIVE ? -money.amount : money.amount;
}

@Injectable()
export class McpReadService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(BalanceSnapshotEntity)
    private readonly balanceSnapshotRepository: Repository<BalanceSnapshotEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    private readonly currencyConversionService: CurrencyConversionService,
  ) {}

  async listTransactions(
    userId: string,
    options: McpListTransactionsOptions,
  ): Promise<McpListTransactionsResult> {
    const reportingCurrency = normalizeCurrency(options.reportingCurrency);
    const amountFilter = options.amountFilter
      ? {
          ...options.amountFilter,
          currency: normalizeCurrency(options.amountFilter.currency),
        }
      : undefined;

    if (amountFilter && amountFilter.currency !== reportingCurrency) {
      throw new BadRequestException(
        'amountFilter.currency must match reportingCurrency.',
      );
    }

    const pageSize = clampPageSize(
      options.pageSize,
      TRANSACTION_DEFAULT_PAGE_SIZE,
      TRANSACTION_MAX_PAGE_SIZE,
    );
    const query = this.buildTransactionQuery(userId, options);
    const conversionRates = new Map<string, McpConversionRate>();
    const data: McpTransaction[] = [];
    let cursor = decodeTransactionCursor(options.cursor);
    let hasMore = false;
    let nextCursor: string | null = null;

    while (data.length < pageSize) {
      const batch = await this.applyTransactionCursor(query.clone(), cursor)
        .take(CANDIDATE_BATCH_SIZE)
        .getMany();

      if (batch.length === 0) {
        hasMore = false;
        nextCursor = null;
        break;
      }

      for (const transaction of batch) {
        const mapped = await this.toMcpTransaction(
          transaction,
          reportingCurrency,
          conversionRates,
        );

        if (amountFilter && !this.matchesAmountFilter(mapped, amountFilter)) {
          continue;
        }

        data.push(mapped);
        if (data.length === pageSize) {
          nextCursor = encodeCursor({
            activityDate: this.getActivityDate(transaction),
            id: transaction.id,
          });
          hasMore = true;
          break;
        }
      }

      if (data.length === pageSize) {
        break;
      }

      const lastCandidate = batch[batch.length - 1];
      cursor = {
        activityDate: this.getActivityDate(lastCandidate),
        id: lastCandidate.id,
      };
      hasMore = batch.length === CANDIDATE_BATCH_SIZE;

      if (!hasMore) {
        nextCursor = null;
        break;
      }
    }

    return {
      data,
      pageInfo: {
        nextCursor,
        hasMore,
      },
      conversion: {
        reportingCurrency,
        rates: Array.from(conversionRates.values()).sort((left, right) =>
          `${left.rateDate}:${left.from}`.localeCompare(
            `${right.rateDate}:${right.from}`,
          ),
        ),
      },
      query: {
        startDate: options.startDate,
        endDate: options.endDate,
        includePending: options.includePending ?? false,
        reportingCurrency,
        amountFilter,
      },
    };
  }

  async listBalanceSnapshots(
    userId: string,
    options: McpListBalanceSnapshotsOptions,
  ): Promise<McpListBalanceSnapshotsResult> {
    const pageSize = clampPageSize(
      options.pageSize,
      SNAPSHOT_DEFAULT_PAGE_SIZE,
      SNAPSHOT_MAX_PAGE_SIZE,
    );
    const cursor = decodeCursor(options.cursor);

    const query = this.balanceSnapshotRepository
      .createQueryBuilder('snapshot')
      .leftJoinAndSelect('snapshot.account', 'account')
      .leftJoinAndSelect('account.bankLink', 'bankLink')
      .where('snapshot.userId = :userId', { userId })
      .orderBy('snapshot.snapshotDate', 'DESC')
      .addOrderBy('snapshot.id', 'DESC')
      .take(pageSize + 1);

    if (options.startDate) {
      query.andWhere('snapshot.snapshotDate >= :startDate', {
        startDate: options.startDate,
      });
    }
    if (options.endDate) {
      query.andWhere('snapshot.snapshotDate <= :endDate', {
        endDate: options.endDate,
      });
    }
    if (options.accountIds?.length) {
      query.andWhere('snapshot.accountId IN (:...accountIds)', {
        accountIds: options.accountIds,
      });
    }
    if (cursor) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('snapshot.snapshotDate < :cursorDate', {
            cursorDate: cursor.date,
          }).orWhere(
            'snapshot.snapshotDate = :cursorDate AND snapshot.id < :cursorId',
            {
              cursorDate: cursor.date,
              cursorId: cursor.id,
            },
          );
        }),
      );
    }

    const rows = await query.getMany();
    const pageRows = rows.slice(0, pageSize);
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map((snapshot) => this.toMcpBalanceSnapshot(snapshot)),
      pageInfo: {
        nextCursor:
          rows.length > pageSize && last
            ? encodeCursor({ date: last.snapshotDate, id: last.id })
            : null,
        hasMore: rows.length > pageSize,
      },
      query: {
        startDate: options.startDate,
        endDate: options.endDate,
      },
    };
  }

  async listCategories(
    userId: string,
    options: McpListCategoriesOptions,
  ): Promise<McpListCategoriesResult> {
    const categories = await this.categoryRepository.find({
      where: { userId, archivedAt: IsNull() },
      order: { primary: 'ASC', detailed: 'ASC' },
    });
    const counts = await this.getCategoryCounts(userId, options);
    const categoriesByPrimary = new Map<string, CategoryEntity[]>();

    categories.forEach((category) => {
      const existing = categoriesByPrimary.get(category.primary) ?? [];
      existing.push(category);
      categoriesByPrimary.set(category.primary, existing);
    });

    return {
      data: [
        {
          primary: 'UNCATEGORIZED',
          primaryLabel: formatCategoryLabel('UNCATEGORIZED'),
          description: 'Transactions with no assigned category.',
          detailedCategories: [],
          transactionCount: counts.get('UNCATEGORIZED') ?? 0,
        },
        ...Array.from(categoriesByPrimary.entries()).map(
          ([primary, detailedCategories]) => ({
            primary,
            primaryLabel: formatCategoryLabel(primary),
            description: detailedCategories[0]?.description ?? null,
            detailedCategories: detailedCategories.map((category) => ({
              detailed: category.detailed,
              detailedLabel: formatCategoryLabel(category.detailed),
              description: category.description,
            })),
            transactionCount: counts.get(primary) ?? 0,
          }),
        ),
      ],
      query: {
        startDate: options.startDate,
        endDate: options.endDate,
      },
    };
  }

  private buildTransactionQuery(
    userId: string,
    options: McpListTransactionsOptions,
  ): SelectQueryBuilder<TransactionEntity> {
    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.activity', 'activity')
      .leftJoinAndSelect('activity.account', 'account')
      .leftJoinAndSelect('account.bankLink', 'bankLink')
      .leftJoinAndSelect('transaction.category', 'category')
      .addSelect(TRANSACTION_ACTIVITY_DATE_EXPRESSION, ACTIVITY_DATE_SORT_ALIAS)
      .where('activity.userId = :userId', { userId })
      .orderBy(ACTIVITY_DATE_SORT_ALIAS, 'DESC')
      .addOrderBy('transaction.id', 'DESC');

    if (options.startDate) {
      query.andWhere(`${TRANSACTION_ACTIVITY_DATE_EXPRESSION} >= :startDate`, {
        startDate: options.startDate,
      });
    }
    if (options.endDate) {
      query.andWhere(`${TRANSACTION_ACTIVITY_DATE_EXPRESSION} <= :endDate`, {
        endDate: options.endDate,
      });
    }
    if (options.accountIds?.length) {
      query.andWhere('activity.accountId IN (:...accountIds)', {
        accountIds: options.accountIds,
      });
    }
    if (!options.includePending) {
      query.andWhere('transaction.pending = false');
    }
    if (options.categoryPrimary) {
      if (options.categoryPrimary === 'UNCATEGORIZED') {
        query.andWhere('transaction.categoryId IS NULL');
      } else {
        query.andWhere('category.primary = :categoryPrimary', {
          categoryPrimary: options.categoryPrimary,
        });
      }
    }
    const merchantQuery = options.merchantQuery?.trim();
    if (merchantQuery) {
      query.andWhere('transaction.merchantName ILIKE :merchantQuery', {
        merchantQuery: `%${merchantQuery}%`,
      });
    }

    return query;
  }

  private applyTransactionCursor(
    query: SelectQueryBuilder<TransactionEntity>,
    cursor: TransactionCursorPayload | undefined,
  ): SelectQueryBuilder<TransactionEntity> {
    if (!cursor) {
      return query;
    }

    return query.andWhere(
      new Brackets((qb) => {
        qb.where(
          `${TRANSACTION_ACTIVITY_DATE_EXPRESSION} < :cursorActivityDate`,
          {
            cursorActivityDate: cursor.activityDate,
          },
        ).orWhere(
          `${TRANSACTION_ACTIVITY_DATE_EXPRESSION} = :cursorActivityDate AND transaction.id < :cursorId`,
          {
            cursorActivityDate: cursor.activityDate,
            cursorId: cursor.id,
          },
        );
      }),
    );
  }

  private async toMcpTransaction(
    transaction: TransactionEntity,
    reportingCurrency: string,
    conversionRates: Map<string, McpConversionRate>,
  ): Promise<McpTransaction> {
    const nativeAmount = transaction.amount.toMoneyWithSign();
    const category = transaction.category;
    const providerCategoryHint = transaction.toObject().providerCategoryHint;
    const rate = await this.getRate(
      nativeAmount.money.currency,
      reportingCurrency,
      this.getActivityDate(transaction),
      conversionRates,
    );
    const convertedAmount = convertMoney(
      nativeAmount,
      reportingCurrency,
      rate,
      this.currencyConversionService,
    );

    return {
      id: transaction.id,
      accountId: transaction.accountId,
      accountName:
        transaction.account?.customName ??
        transaction.account?.name ??
        'Account',
      merchantName: transaction.merchantName,
      pending: transaction.pending,
      activityDate: this.getActivityDate(transaction),
      reportingDateOverride: transaction.reportingDateOverride,
      providerDate: transaction.providerDate,
      providerDatetime: transaction.providerDatetime,
      authorizedDate: transaction.authorizedDate,
      categoryPrimary: category?.primary ?? null,
      categoryPrimaryLabel: formatCategoryLabel(category?.primary ?? null),
      categoryDetailed: category?.detailed ?? null,
      categoryDetailedLabel: category?.detailed
        ? formatCategoryLabel(category.detailed)
        : null,
      providerCategoryHint,
      amount: toMcpMoney(nativeAmount),
      convertedAmount: toMcpMoney(convertedAmount),
    };
  }

  private async getRate(
    fromCurrency: string,
    toCurrency: string,
    rateDate: string,
    conversionRates: Map<string, McpConversionRate>,
  ): Promise<number> {
    const from = normalizeCurrency(fromCurrency);
    const to = normalizeCurrency(toCurrency);
    const key = `${rateDate}:${from}:${to}`;
    const cached = conversionRates.get(key);
    if (cached) {
      return cached.rate;
    }

    if (from === to) {
      const sameCurrencyRate = { from, to, rate: 1, rateDate };
      conversionRates.set(key, sameCurrencyRate);
      return 1;
    }

    const rateMap = await this.currencyConversionService.getRateMap(
      [from],
      to,
      rateDate,
    );
    const rate = rateMap.get(from);
    if (rate === undefined) {
      throw new BadRequestException(
        `Missing conversion rate from ${from} to ${to} for ${rateDate}.`,
      );
    }

    conversionRates.set(key, { from, to, rate, rateDate });
    return rate;
  }

  private getActivityDate(transaction: TransactionEntity): string {
    return getTransactionActivityDate(transaction);
  }

  private matchesAmountFilter(
    transaction: McpTransaction,
    amountFilter: McpAmountFilter,
  ): boolean {
    const amount = Math.abs(signedMajorAmount(transaction.convertedAmount));
    const min = amountFilter.min ?? Number.NEGATIVE_INFINITY;
    const max = amountFilter.max ?? Number.POSITIVE_INFINITY;

    return (
      transaction.convertedAmount.currency === amountFilter.currency &&
      amount >= min &&
      amount <= max
    );
  }

  private toMcpBalanceSnapshot(
    snapshot: BalanceSnapshotEntity,
  ): McpBalanceSnapshot {
    const account = snapshot.account;
    const accountType = String(account.type);
    const accountSubType = account.subType ?? null;
    const grouping = getAccountGrouping(accountType);

    return {
      id: snapshot.id,
      accountId: snapshot.accountId,
      accountName: account.customName ?? account.name ?? 'Account',
      accountType,
      accountTypeLabel: formatAccountLabel(accountType),
      accountSubType,
      accountSubTypeLabel: accountSubType
        ? formatAccountLabel(accountSubType)
        : null,
      grouping,
      groupingLabel: getAccountGroupingLabel(grouping),
      institutionName: account.bankLink?.institutionName ?? null,
      snapshotDate: snapshot.snapshotDate,
      snapshotType: snapshot.snapshotType,
      currentBalance: toMcpMoney(snapshot.currentBalance.toMoneyWithSign()),
      availableBalance: toMcpMoney(snapshot.availableBalance.toMoneyWithSign()),
    };
  }

  private async getCategoryCounts(
    userId: string,
    options: McpListCategoriesOptions,
  ): Promise<Map<string, number>> {
    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.activity', 'activity')
      .leftJoin('transaction.category', 'category')
      .select('COALESCE(category.primary, :uncategorized)', 'primary')
      .addSelect('COUNT(transaction.id)', 'count')
      .where('activity.userId = :userId', { userId })
      .setParameter('uncategorized', 'UNCATEGORIZED')
      .groupBy('COALESCE(category.primary, :uncategorized)');

    if (options.startDate) {
      query.andWhere(`${TRANSACTION_ACTIVITY_DATE_EXPRESSION} >= :startDate`, {
        startDate: options.startDate,
      });
    }
    if (options.endDate) {
      query.andWhere(`${TRANSACTION_ACTIVITY_DATE_EXPRESSION} <= :endDate`, {
        endDate: options.endDate,
      });
    }

    const rows = await query.getRawMany<{ primary: string; count: string }>();
    return new Map(
      rows.map((row) => [row.primary, Number.parseInt(row.count, 10)]),
    );
  }
}
