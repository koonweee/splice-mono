import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsOrder,
  FindOptionsWhere,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import type {
  AskComparePeriodsOptions,
  AskComparePeriodsResult,
  AskEvidenceAggregate,
  AskTransactionSearchOptions,
  AskTransactionSearchResult,
  AskTransactionSummaryOptions,
  AskTransactionSummaryResult,
} from '../ask/ask.types';
import { CategoryEntity } from '../category/category.entity';
import type { TransactionSyncResponse } from '../types/BankLink';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import {
  CreateTransactionDto,
  Transaction,
  UpdateTransactionDto,
} from '../types/Transaction';
import { MoneySign } from '../types/MoneyWithSign';
import { TransactionEntity } from './transaction.entity';

@Injectable()
export class TransactionService extends OwnedCrudService<
  TransactionEntity,
  Transaction,
  CreateTransactionDto,
  UpdateTransactionDto
> {
  protected readonly logger = new Logger(TransactionService.name);
  protected readonly entityName = 'Transaction';
  protected readonly EntityClass = TransactionEntity;
  protected readonly relations = ['account', 'category'];

  constructor(
    @InjectRepository(TransactionEntity)
    repository: Repository<TransactionEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
  ) {
    super(repository);
  }

  /**
   * Build a lookup map of "primary:detailed" -> category UUID
   */
  private async buildCategoryLookup(): Promise<Map<string, string>> {
    const categories = await this.categoryRepository.find();
    const map = new Map<string, string>();
    categories.forEach((cat) => {
      map.set(`${cat.primary}:${cat.detailed}`, cat.id);
    });
    return map;
  }

  protected applyUpdate(
    entity: TransactionEntity,
    dto: UpdateTransactionDto,
  ): void {
    if (dto.amount !== undefined) {
      entity.amount = BalanceColumns.fromMoneyWithSign(dto.amount);
    }
    if (dto.accountId !== undefined) entity.accountId = dto.accountId;
    if (dto.merchantName !== undefined) entity.merchantName = dto.merchantName;
    if (dto.pending !== undefined) entity.pending = dto.pending;
    if (dto.externalTransactionId !== undefined) {
      entity.externalTransactionId = dto.externalTransactionId;
    }
    if (dto.logoUrl !== undefined) entity.logoUrl = dto.logoUrl;
    if (dto.date !== undefined) entity.date = dto.date;
    if (dto.datetime !== undefined) entity.datetime = dto.datetime;
    if (dto.authorizedDate !== undefined) {
      entity.authorizedDate = dto.authorizedDate;
    }
    if (dto.authorizedDatetime !== undefined) {
      entity.authorizedDatetime = dto.authorizedDatetime;
    }
    if (dto.categoryId !== undefined) entity.categoryId = dto.categoryId;
  }

  private static readonly SORTABLE_COLUMNS = new Set([
    'date',
    'merchantName',
    'pending',
    'amount',
  ]);

  /**
   * Find all transactions with pagination, sorting, and optional filters
   */
  async findAllPaginated(
    userId: string,
    options: {
      pageIndex: number;
      pageSize: number;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
      accountId?: string;
      startDate?: string;
      endDate?: string;
      categoryPrimary?: string;
      amountSign?: string;
    },
  ): Promise<{ data: Transaction[]; total: number }> {
    const {
      pageIndex,
      pageSize,
      sortBy,
      sortOrder = 'DESC',
      accountId,
      startDate,
      endDate,
      categoryPrimary,
      amountSign,
    } = options;

    const sortColumn =
      sortBy && TransactionService.SORTABLE_COLUMNS.has(sortBy)
        ? sortBy
        : 'date';
    const order: 'ASC' | 'DESC' = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const where: FindOptionsWhere<TransactionEntity> = { userId };
    if (accountId) {
      where.accountId = accountId;
    }

    // Date range filters
    if (startDate && endDate) {
      where.date = Between(startDate, endDate);
    } else if (startDate) {
      where.date = MoreThanOrEqual(startDate);
    } else if (endDate) {
      where.date = LessThanOrEqual(endDate);
    }

    // Amount sign filter
    if (amountSign === 'positive' || amountSign === 'negative') {
      where.amount = { sign: amountSign } as unknown as BalanceColumns;
    }

    // Category primary filter
    if (categoryPrimary) {
      if (categoryPrimary === 'UNCATEGORIZED') {
        where.categoryId = IsNull();
      } else {
        const matchingCategories = await this.categoryRepository.find({
          where: { primary: categoryPrimary },
        });
        if (matchingCategories.length === 0) {
          return { data: [], total: 0 };
        }
        where.categoryId = In(matchingCategories.map((c) => c.id));
      }
    }

    this.logger.log(
      {
        userId,
        pageIndex,
        pageSize,
        sortColumn,
        order,
        accountId,
        startDate,
        endDate,
        categoryPrimary,
        amountSign,
      },
      'Finding paginated transactions',
    );

    // Embedded columns (e.g. amount) need nested order syntax for TypeORM
    const orderClause: FindOptionsOrder<TransactionEntity> =
      sortColumn === 'amount'
        ? { amount: { amount: order } }
        : { [sortColumn]: order };

    const [entities, total] = await this.repository.findAndCount({
      where,
      relations: this.relations,
      order: orderClause,
      skip: pageIndex * pageSize,
      take: pageSize,
    });

    this.logger.log(
      { userId, count: entities.length, total },
      'Found paginated transactions',
    );

    return {
      data: entities.map((entity) => entity.toObject()),
      total,
    };
  }

  /**
   * Find all transactions for a specific account
   */
  async findByAccountId(
    accountId: string,
    userId: string,
  ): Promise<Transaction[]> {
    const entities = await this.repository.find({
      where: { accountId, userId },
      relations: this.relations,
    });
    return entities.map((entity) => entity.toObject());
  }

  private async findMatchingTransactions(
    userId: string,
    options: {
      startDate?: string;
      endDate?: string;
      accountIds?: string[];
      includePending?: boolean;
      categoryPrimary?: string;
      merchantQuery?: string;
      sign?: 'positive' | 'negative';
      minAmount?: number;
      maxAmount?: number;
    },
  ): Promise<Transaction[]> {
    const where: FindOptionsWhere<TransactionEntity> = { userId };

    if (options.accountIds?.length === 1) {
      where.accountId = options.accountIds[0];
    } else if (options.accountIds && options.accountIds.length > 1) {
      where.accountId = In(options.accountIds);
    }

    if (options.startDate && options.endDate) {
      where.date = Between(options.startDate, options.endDate);
    } else if (options.startDate) {
      where.date = MoreThanOrEqual(options.startDate);
    } else if (options.endDate) {
      where.date = LessThanOrEqual(options.endDate);
    }

    if (!options.includePending) {
      where.pending = false;
    }

    if (options.sign === 'positive' || options.sign === 'negative') {
      where.amount = { sign: options.sign } as unknown as BalanceColumns;
    }

    const entities = await this.repository.find({
      where,
      relations: this.relations,
      order: { date: 'DESC' },
    });

    return entities
      .map((entity) => entity.toObject())
      .filter((transaction) => {
        const merchantQuery = options.merchantQuery?.trim().toLowerCase();
        if (
          merchantQuery &&
          !transaction.merchantName?.toLowerCase().includes(merchantQuery)
        ) {
          return false;
        }

        if (options.categoryPrimary) {
          const primaryCategory = transaction.category?.primary ?? null;
          if (options.categoryPrimary === 'UNCATEGORIZED') {
            if (primaryCategory !== null) {
              return false;
            }
          } else if (primaryCategory !== options.categoryPrimary) {
            return false;
          }
        }

        const amount = transaction.amount.money.amount;
        if (options.minAmount !== undefined && amount < options.minAmount) {
          return false;
        }
        if (options.maxAmount !== undefined && amount > options.maxAmount) {
          return false;
        }

        return true;
      });
  }

  async findForAsk(
    userId: string,
    options: AskTransactionSearchOptions,
  ): Promise<AskTransactionSearchResult> {
    const matches = await this.findMatchingTransactions(userId, options);
    const limit = options.limit ?? 20;

    return {
      matchedCount: matches.length,
      truncated: matches.length > limit,
      transactions: matches.slice(0, limit).map((transaction) => ({
        id: transaction.id,
        accountId: transaction.accountId,
        accountName: transaction.accountName ?? 'Account',
        merchantName: transaction.merchantName,
        pending: transaction.pending,
        date: transaction.date,
        categoryPrimary: transaction.category?.primary ?? null,
        amount: transaction.amount,
      })),
    };
  }

  private static readonly AGGREGATE_LIMIT = 10;

  private buildTopAggregates(
    entries: Iterable<[string, number]>,
    currency: string,
    kind: AskEvidenceAggregate['kind'],
  ): AskEvidenceAggregate[] {
    return Array.from(entries)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, TransactionService.AGGREGATE_LIMIT)
      .map(([label, amount]) => ({
        label,
        amount,
        currency,
        kind,
      }));
  }

  private detectRecurringTransactions(
    transactions: Transaction[],
  ): AskTransactionSummaryResult['recurringTransactions'] {
    const merchants = new Map<string, Transaction[]>();

    transactions.forEach((transaction) => {
      if (
        !transaction.merchantName ||
        transaction.amount.sign !== MoneySign.NEGATIVE
      ) {
        return;
      }
      const key = transaction.merchantName.trim().toLowerCase();
      const existing = merchants.get(key) ?? [];
      existing.push(transaction);
      merchants.set(key, existing);
    });

    return Array.from(merchants.entries())
      .map(([merchantName, grouped]) => {
        const sorted = grouped.sort((a, b) => a.date.localeCompare(b.date));
        if (sorted.length < 2) {
          return null;
        }

        const dayDiffs = sorted.slice(1).map((transaction, index) => {
          const previous = new Date(sorted[index].date).getTime();
          const current = new Date(transaction.date).getTime();
          return Math.round((current - previous) / (1000 * 60 * 60 * 24));
        });

        const cadence = dayDiffs.some((diff) => diff >= 25 && diff <= 35)
          ? 'monthly'
          : dayDiffs.some((diff) => diff >= 6 && diff <= 8)
            ? 'weekly'
            : 'unknown';

        return {
          merchantName: sorted[0].merchantName ?? merchantName,
          cadence,
          amount: sorted[sorted.length - 1].amount.money.amount,
        };
      })
      .filter(
        (
          value,
        ): value is AskTransactionSummaryResult['recurringTransactions'][number] =>
          value !== null,
      )
      .slice(0, TransactionService.AGGREGATE_LIMIT);
  }

  async summarizeForAsk(
    userId: string,
    options: AskTransactionSummaryOptions,
  ): Promise<AskTransactionSummaryResult> {
    const matches = await this.findMatchingTransactions(userId, options);

    const categoryTotals = new Map<string, number>();
    const merchantTotals = new Map<string, number>();
    const accountTotals = new Map<string, number>();
    let totalInflow = 0;
    let totalOutflow = 0;

    matches.forEach((transaction) => {
      const amount = transaction.amount.money.amount;
      const signedAmount =
        transaction.amount.sign === MoneySign.POSITIVE ? amount : -amount;
      const magnitude = Math.abs(signedAmount);

      if (transaction.amount.sign === MoneySign.POSITIVE) {
        totalInflow += magnitude;
      } else {
        totalOutflow += magnitude;
      }

      const category = transaction.category?.primary ?? 'UNCATEGORIZED';
      categoryTotals.set(
        category,
        (categoryTotals.get(category) ?? 0) + magnitude,
      );

      const merchant = transaction.merchantName ?? 'Unknown merchant';
      merchantTotals.set(
        merchant,
        (merchantTotals.get(merchant) ?? 0) + magnitude,
      );

      const account = transaction.accountName ?? 'Account';
      accountTotals.set(account, (accountTotals.get(account) ?? 0) + magnitude);
    });

    const currency = matches[0]?.amount.money.currency ?? 'USD';
    const recurringTransactions = this.detectRecurringTransactions(matches);

    return {
      totalInflow,
      totalOutflow,
      net: totalInflow - totalOutflow,
      transactionCount: matches.length,
      topCategories: this.buildTopAggregates(
        categoryTotals.entries(),
        currency,
        'category',
      ),
      topMerchants: this.buildTopAggregates(
        merchantTotals.entries(),
        currency,
        'merchant',
      ),
      topAccounts: this.buildTopAggregates(
        accountTotals.entries(),
        currency,
        'account',
      ),
      recurringTransactions: options.recurringOnly
        ? recurringTransactions
        : recurringTransactions,
      matchedCount: matches.length,
      truncated: false,
    };
  }

  async compareForAsk(
    userId: string,
    options: AskComparePeriodsOptions,
  ): Promise<AskComparePeriodsResult> {
    const current = await this.summarizeForAsk(userId, {
      startDate: options.currentStartDate,
      endDate: options.currentEndDate,
      accountIds: options.accountIds,
      includePending: options.includePending,
    });
    const previous = await this.summarizeForAsk(userId, {
      startDate: options.previousStartDate,
      endDate: options.previousEndDate,
      accountIds: options.accountIds,
      includePending: options.includePending,
    });

    const buildDeltaDrivers = (
      currentEntries: AskEvidenceAggregate[],
      previousEntries: AskEvidenceAggregate[],
      kind: AskEvidenceAggregate['kind'],
    ) => {
      const currentMap = new Map(
        currentEntries.map((entry) => [entry.label, entry.amount]),
      );
      const previousMap = new Map(
        previousEntries.map((entry) => [entry.label, entry.amount]),
      );
      const labels = new Set([...currentMap.keys(), ...previousMap.keys()]);
      const currency =
        currentEntries[0]?.currency ?? previousEntries[0]?.currency ?? 'USD';

      return this.buildTopAggregates(
        Array.from(labels).map((label) => [
          label,
          (currentMap.get(label) ?? 0) - (previousMap.get(label) ?? 0),
        ]),
        currency,
        kind,
      );
    };

    const absoluteDelta = current.totalOutflow - previous.totalOutflow;
    const percentDelta =
      previous.totalOutflow === 0
        ? current.totalOutflow === 0
          ? 0
          : 100
        : (absoluteDelta / previous.totalOutflow) * 100;

    return {
      currentTotalOutflow: current.totalOutflow,
      previousTotalOutflow: previous.totalOutflow,
      absoluteDelta,
      percentDelta,
      categoryDrivers: buildDeltaDrivers(
        current.topCategories,
        previous.topCategories,
        'category',
      ),
      merchantDrivers: buildDeltaDrivers(
        current.topMerchants,
        previous.topMerchants,
        'merchant',
      ),
      accountDrivers: buildDeltaDrivers(
        current.topAccounts,
        previous.topAccounts,
        'account',
      ),
      matchedCount: current.matchedCount + previous.matchedCount,
      truncated: current.truncated || previous.truncated,
    };
  }

  /**
   * Process transaction sync results (added/modified/removed) atomically
   * Maps external account IDs to internal account IDs before persisting
   *
   * @param userId - Owner of the transactions
   * @param accountIdMap - Map of external account ID to internal account ID
   * @param syncResults - Results from provider's syncTransactions call
   */
  async processSyncResults(
    userId: string,
    accountIdMap: Map<string, string>,
    syncResults: TransactionSyncResponse,
  ): Promise<void> {
    const { added, modified, removed } = syncResults;

    this.logger.log(
      {
        userId,
        addedCount: added.length,
        modifiedCount: modified.length,
        removedCount: removed.length,
      },
      'Processing transaction sync results',
    );

    // Build category lookup once for the entire sync batch
    const categoryLookup = await this.buildCategoryLookup();

    await this.repository.manager.transaction(async (manager) => {
      const txnRepo = manager.getRepository(TransactionEntity);

      // Process added transactions
      if (added.length > 0) {
        const newEntities = added
          .map((dto) => {
            const internalAccountId = accountIdMap.get(dto.accountId);
            if (!internalAccountId) {
              this.logger.warn(
                { externalAccountId: dto.accountId },
                'No internal account found for external account ID, skipping transaction',
              );
              return null;
            }
            const resolvedDto = this.resolveCategoryId(dto, categoryLookup);
            return TransactionEntity.fromDto(
              { ...resolvedDto, accountId: internalAccountId },
              userId,
            );
          })
          .filter((e): e is TransactionEntity => e !== null);

        if (newEntities.length > 0) {
          await txnRepo.save(newEntities);
          this.logger.log(
            { count: newEntities.length },
            'Inserted new transactions',
          );
        }
      }

      // Process modified transactions
      if (modified.length > 0) {
        const modifyResults = await Promise.allSettled(
          modified.map(async (dto) => {
            const internalAccountId = accountIdMap.get(dto.accountId);
            if (!internalAccountId) {
              this.logger.warn(
                { externalAccountId: dto.accountId },
                'No internal account found for modified transaction, skipping',
              );
              return;
            }

            const resolvedDto = this.resolveCategoryId(dto, categoryLookup);

            const existing = await txnRepo.findOne({
              where: {
                externalTransactionId: dto.externalTransactionId ?? undefined,
                accountId: internalAccountId,
                userId,
              },
            });

            if (!existing) {
              this.logger.warn(
                { externalTransactionId: dto.externalTransactionId },
                'Modified transaction not found locally, inserting as new',
              );
              await txnRepo.save(
                TransactionEntity.fromDto(
                  { ...resolvedDto, accountId: internalAccountId },
                  userId,
                ),
              );
              return;
            }

            this.applyUpdate(existing, {
              ...resolvedDto,
              accountId: internalAccountId,
            });
            await txnRepo.save(existing);
          }),
        );

        const failedCount = modifyResults.filter(
          (r) => r.status === 'rejected',
        ).length;
        if (failedCount > 0) {
          this.logger.warn(
            { failedCount, totalCount: modified.length },
            'Some modified transactions failed to update',
          );
        }
      }

      // Process removed transactions
      if (removed.length > 0) {
        // Get all internal account IDs for the removal query
        const internalAccountIds = [...accountIdMap.values()];

        const deleteResult = await txnRepo.delete({
          externalTransactionId: In(removed),
          accountId: In(internalAccountIds),
          userId,
        });

        this.logger.log(
          {
            requestedCount: removed.length,
            deletedCount: deleteResult.affected,
          },
          'Removed transactions',
        );
      }
    });

    this.logger.log({}, 'Transaction sync results processed successfully');
  }

  /**
   * Resolve categoryId from personalFinanceCategory strings using the lookup map.
   * Returns a new DTO with categoryId set if a match is found.
   */
  private resolveCategoryId(
    dto: CreateTransactionDto,
    categoryLookup: Map<string, string>,
  ): CreateTransactionDto {
    if (!dto.personalFinanceCategory) {
      return dto;
    }

    const { primary, detailed } = dto.personalFinanceCategory;
    const categoryId = categoryLookup.get(`${primary}:${detailed}`);

    if (!categoryId) {
      this.logger.warn(
        { primary, detailed },
        'No category found for personal finance category',
      );
      return dto;
    }

    return { ...dto, categoryId };
  }
}
