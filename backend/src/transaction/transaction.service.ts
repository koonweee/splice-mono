import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsOrder,
  FindOptionsWhere,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { CategoryEntity } from '../category/category.entity';
import type { TransactionSyncResponse } from '../types/BankLink';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import {
  BulkTransactionCategoryReviewDto,
  BulkTransactionCategoryReviewResponse,
  BulkTransactionCategoryReviewUndoDto,
  CreateTransactionDto,
  Transaction,
  TransactionCategoryReviewMethod,
  TransactionCategoryReviewStatus,
  UpdateTransactionCategoryDto,
  UpdateTransactionCategoryReviewDto,
  UpdateTransactionDto,
} from '../types/Transaction';
import { TransactionEntity } from './transaction.entity';
import { CategoryService } from '../category/category.service';
import type {
  TransactionSurfaceSearchOptions,
  TransactionSurfaceSearchResult,
} from './transaction-surface.types';

type TransactionFilterOptions = {
  accountId?: string;
  startDate?: string;
  endDate?: string;
  categoryPrimary?: string;
  amountSign?: string;
  categoryReviewStatus?: TransactionCategoryReviewStatus;
};

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
  protected readonly relations = ['account', 'category', 'userCategory'];

  constructor(
    @InjectRepository(TransactionEntity)
    repository: Repository<TransactionEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    private readonly categoryService: CategoryService,
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
    if (dto.providerTransactionName !== undefined) {
      entity.providerTransactionName = dto.providerTransactionName;
    }
    if (dto.originalDescription !== undefined) {
      entity.originalDescription = dto.originalDescription;
    }
    if (dto.pending !== undefined) entity.pending = dto.pending;
    if (dto.pendingTransactionId !== undefined) {
      entity.pendingTransactionId = dto.pendingTransactionId;
    }
    if (dto.accountOwner !== undefined) entity.accountOwner = dto.accountOwner;
    if (dto.externalTransactionId !== undefined) {
      entity.externalTransactionId = dto.externalTransactionId;
    }
    if (dto.logoUrl !== undefined) entity.logoUrl = dto.logoUrl;
    if (dto.website !== undefined) entity.website = dto.website;
    if (dto.merchantEntityId !== undefined) {
      entity.merchantEntityId = dto.merchantEntityId;
    }
    if (dto.paymentChannel !== undefined) {
      entity.paymentChannel = dto.paymentChannel;
    }
    if (dto.transactionCode !== undefined) {
      entity.transactionCode = dto.transactionCode;
    }
    if (dto.personalFinanceCategoryIconUrl !== undefined) {
      entity.personalFinanceCategoryIconUrl =
        dto.personalFinanceCategoryIconUrl;
    }
    if (dto.personalFinanceCategoryConfidenceLevel !== undefined) {
      entity.personalFinanceCategoryConfidenceLevel =
        dto.personalFinanceCategoryConfidenceLevel;
    }
    if (dto.counterparties !== undefined) {
      entity.counterparties = dto.counterparties;
    }
    if (dto.location !== undefined) entity.location = dto.location;
    if (dto.paymentMeta !== undefined) entity.paymentMeta = dto.paymentMeta;
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

  async create(
    dto: CreateTransactionDto,
    userId: string,
  ): Promise<Transaction> {
    this.logger.log({ userId }, `Creating ${this.entityName}`);

    const entity = this.EntityClass.fromDto(
      { ...dto, categoryId: null },
      userId,
    );
    const category = await this.resolveAssignableCategorySelection(
      dto.categoryId,
      userId,
    );
    this.applyCategorySelection(entity, category);

    const savedEntity = await this.repository.save(entity);
    this.logger.log(
      { id: savedEntity.id },
      `${this.entityName} created successfully`,
    );
    return savedEntity.toObject();
  }

  async update(
    id: string,
    dto: UpdateTransactionDto,
    userId: string,
  ): Promise<Transaction | null> {
    this.logger.log({ id, userId }, `Updating ${this.entityName}`);

    const entity = await this.repository.findOne({
      where: { id, userId },
      relations: this.relations,
    });

    if (!entity) {
      this.logger.warn(
        { id, userId },
        `${this.entityName} not found for update`,
      );
      return null;
    }

    const category = await this.resolveAssignableCategorySelection(
      dto.categoryId,
      userId,
    );

    const updateDto =
      dto.categoryId === undefined ? dto : { ...dto, categoryId: undefined };
    this.applyUpdate(entity, updateDto);
    if (dto.categoryId !== undefined) {
      this.applyCategorySelection(entity, category);
    }

    const savedEntity = await this.repository.save(entity);
    this.logger.log({ id }, `${this.entityName} updated successfully`);
    return savedEntity.toObject();
  }

  private async resolveAssignableCategorySelection(
    categoryId: string | null | undefined,
    userId: string,
  ): Promise<CategoryEntity | null | undefined> {
    if (categoryId === undefined) {
      return undefined;
    }

    if (categoryId === null) {
      return null;
    }

    const category = await this.categoryService.findActiveAssignableCategory(
      categoryId,
      userId,
    );

    if (!category) {
      throw new NotFoundException(`Category with id ${categoryId} not found`);
    }

    return category;
  }

  private applyCategorySelection(
    entity: TransactionEntity,
    category: CategoryEntity | null | undefined,
  ): void {
    if (category === undefined) {
      return;
    }

    if (category === null) {
      entity.categoryId = null;
      entity.category = null;
      entity.userCategoryId = null;
      entity.userCategory = null;
      entity.userCategoryUpdatedAt = null;
      return;
    }

    if (category.source === 'user') {
      entity.userCategoryId = category.id;
      entity.userCategory = category;
      entity.userCategoryUpdatedAt = new Date();
      return;
    }

    entity.categoryId = category.id;
    entity.category = category;
    entity.userCategoryId = null;
    entity.userCategory = null;
    entity.userCategoryUpdatedAt = null;
  }

  private static readonly SORTABLE_COLUMNS = new Set([
    'date',
    'merchantName',
    'pending',
    'amount',
  ]);

  private markCategoryReviewed(
    entity: TransactionEntity,
    method: TransactionCategoryReviewMethod,
  ): void {
    entity.categoryReviewedAt = new Date();
    entity.categoryReviewMethod = method;
  }

  private clearCategoryReview(entity: TransactionEntity): void {
    entity.categoryReviewedAt = null;
    entity.categoryReviewMethod = null;
  }

  private buildFindOrder(
    sortColumn: string,
    order: 'ASC' | 'DESC',
  ): FindOptionsOrder<TransactionEntity> {
    const orderClause: FindOptionsOrder<TransactionEntity> =
      sortColumn === 'amount'
        ? { amount: { amount: order } }
        : sortColumn === 'merchantName'
          ? { merchantName: order }
          : sortColumn === 'pending'
            ? { pending: order }
            : { date: order };

    const chronologicalTieOrder = sortColumn === 'date' ? order : 'DESC';
    if (sortColumn !== 'date') {
      orderClause.date = 'DESC';
    }
    orderClause.datetime = chronologicalTieOrder;
    orderClause.authorizedDatetime = chronologicalTieOrder;
    orderClause.id = chronologicalTieOrder;

    return orderClause;
  }

  private applyTransactionOrder(
    query: SelectQueryBuilder<TransactionEntity>,
    sortColumn: string,
    order: 'ASC' | 'DESC',
  ): SelectQueryBuilder<TransactionEntity> {
    const sortExpression =
      sortColumn === 'amount'
        ? 'transaction.amountAmount'
        : `transaction.${sortColumn}`;
    const chronologicalTieOrder = sortColumn === 'date' ? order : 'DESC';

    query.orderBy(sortExpression, order);
    if (sortColumn !== 'date') {
      query.addOrderBy('transaction.date', 'DESC');
    }
    query
      .addOrderBy('transaction.datetime', chronologicalTieOrder, 'NULLS LAST')
      .addOrderBy(
        'transaction.authorizedDatetime',
        chronologicalTieOrder,
        'NULLS LAST',
      )
      .addOrderBy('transaction.id', chronologicalTieOrder);

    return query;
  }

  private applyCategoryReviewStatusWhere(
    where: FindOptionsWhere<TransactionEntity>,
    categoryReviewStatus?: TransactionCategoryReviewStatus,
  ): void {
    if (categoryReviewStatus === 'needs_review') {
      where.categoryReviewedAt = IsNull();
    } else if (categoryReviewStatus === 'reviewed') {
      where.categoryReviewedAt = Not(IsNull());
    }
  }

  private applyQueryFilters(
    query: SelectQueryBuilder<TransactionEntity>,
    options: TransactionFilterOptions,
  ): void {
    const {
      accountId,
      startDate,
      endDate,
      categoryPrimary,
      amountSign,
      categoryReviewStatus,
    } = options;

    if (accountId) {
      query.andWhere('transaction.accountId = :accountId', { accountId });
    }
    if (startDate && endDate) {
      query.andWhere('transaction.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      query.andWhere('transaction.date >= :startDate', { startDate });
    } else if (endDate) {
      query.andWhere('transaction.date <= :endDate', { endDate });
    }
    if (amountSign === 'positive' || amountSign === 'negative') {
      query.andWhere('transaction.amountSign = :amountSign', { amountSign });
    }
    if (categoryReviewStatus === 'needs_review') {
      query.andWhere('transaction.categoryReviewedAt IS NULL');
    } else if (categoryReviewStatus === 'reviewed') {
      query.andWhere('transaction.categoryReviewedAt IS NOT NULL');
    }
    if (categoryPrimary) {
      if (categoryPrimary === 'UNCATEGORIZED') {
        query.andWhere(
          'COALESCE(transaction.userCategoryId, transaction.categoryId) IS NULL',
        );
      } else {
        query.andWhere(
          'COALESCE(userCategory.primary, category.primary) = :categoryPrimary',
          { categoryPrimary },
        );
      }
    }
  }

  private buildFilteredTransactionQuery(
    userId: string,
    options: TransactionFilterOptions,
  ): SelectQueryBuilder<TransactionEntity> {
    const query = this.repository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.account', 'account')
      .leftJoinAndSelect('transaction.category', 'category')
      .leftJoinAndSelect('transaction.userCategory', 'userCategory')
      .where('transaction.userId = :userId', { userId });

    this.applyQueryFilters(query, options);

    return query;
  }

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
      categoryReviewStatus?: TransactionCategoryReviewStatus;
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
      categoryReviewStatus,
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
    if (startDate && endDate) {
      where.date = Between(startDate, endDate);
    } else if (startDate) {
      where.date = MoreThanOrEqual(startDate);
    } else if (endDate) {
      where.date = LessThanOrEqual(endDate);
    }
    if (amountSign === 'positive' || amountSign === 'negative') {
      where.amount = { sign: amountSign } as unknown as BalanceColumns;
    }
    this.applyCategoryReviewStatusWhere(where, categoryReviewStatus);

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
        categoryReviewStatus,
      },
      'Finding paginated transactions',
    );

    if (!categoryPrimary) {
      const orderClause = this.buildFindOrder(sortColumn, order);

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

    const query = this.buildFilteredTransactionQuery(userId, {
      accountId,
      startDate,
      endDate,
      categoryPrimary,
      amountSign,
      categoryReviewStatus,
    });

    const [entities, total] = await this.applyTransactionOrder(
      query,
      sortColumn,
      order,
    )
      .skip(pageIndex * pageSize)
      .take(pageSize)
      .getManyAndCount();

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

  async updateCategory(
    id: string,
    dto: UpdateTransactionCategoryDto,
    userId: string,
  ): Promise<Transaction | null> {
    this.logger.log({ id, userId }, 'Updating transaction category override');

    const entity = await this.repository.findOne({
      where: { id, userId },
      relations: this.relations,
    });

    if (!entity) {
      this.logger.warn(
        { id, userId },
        'Transaction not found for category override update',
      );
      return null;
    }

    if (dto.categoryId === null || dto.categoryId === entity.categoryId) {
      entity.userCategoryId = null;
      entity.userCategory = null;
      entity.userCategoryUpdatedAt = null;
      this.markCategoryReviewed(entity, 'manual_change');
    } else {
      const category = await this.categoryService.findActiveAssignableCategory(
        dto.categoryId,
        userId,
      );

      if (!category) {
        this.logger.warn(
          { id, userId, categoryId: dto.categoryId },
          'Category not found for transaction override',
        );
        return null;
      }

      entity.userCategoryId = category.id;
      entity.userCategory = category;
      entity.userCategoryUpdatedAt = new Date();
      this.markCategoryReviewed(entity, 'manual_change');
    }

    const savedEntity = await this.repository.save(entity);
    const hydratedEntity = await this.repository.findOne({
      where: { id: savedEntity.id, userId },
      relations: this.relations,
    });

    return (hydratedEntity ?? savedEntity).toObject();
  }

  async updateCategoryReview(
    id: string,
    dto: UpdateTransactionCategoryReviewDto,
    userId: string,
  ): Promise<Transaction | null> {
    this.logger.log({ id, userId }, 'Updating transaction category review');

    const entity = await this.repository.findOne({
      where: { id, userId },
      relations: this.relations,
    });

    if (!entity) {
      this.logger.warn(
        { id, userId },
        'Transaction not found for category review update',
      );
      return null;
    }

    if (dto.reviewed) {
      this.markCategoryReviewed(entity, 'manual_accept');
    } else {
      this.clearCategoryReview(entity);
    }

    const savedEntity = await this.repository.save(entity);
    const hydratedEntity = await this.repository.findOne({
      where: { id: savedEntity.id, userId },
      relations: this.relations,
    });

    return (hydratedEntity ?? savedEntity).toObject();
  }

  async bulkReviewCategories(
    userId: string,
    dto: BulkTransactionCategoryReviewDto,
  ): Promise<BulkTransactionCategoryReviewResponse> {
    this.logger.log(
      { userId, filters: dto.filters },
      'Bulk reviewing transaction categories',
    );

    const query = this.buildFilteredTransactionQuery(userId, dto.filters);
    query.andWhere('transaction.categoryReviewedAt IS NULL');

    const entities = await query.getMany();
    if (entities.length === 0) {
      return { count: 0, transactionIds: [] };
    }

    entities.forEach((entity) => {
      this.markCategoryReviewed(entity, 'bulk_accept');
    });

    await this.repository.save(entities);

    return {
      count: entities.length,
      transactionIds: entities.map((entity) => entity.id),
    };
  }

  async undoBulkReviewCategories(
    userId: string,
    dto: BulkTransactionCategoryReviewUndoDto,
  ): Promise<BulkTransactionCategoryReviewResponse> {
    const transactionIds = [...new Set(dto.transactionIds)];
    this.logger.log(
      { userId, count: transactionIds.length },
      'Undoing bulk transaction category review',
    );

    if (transactionIds.length === 0) {
      return { count: 0, transactionIds: [] };
    }

    const entities = await this.repository.find({
      where: { id: In(transactionIds), userId },
      relations: this.relations,
    });

    if (entities.length === 0) {
      return { count: 0, transactionIds: [] };
    }

    entities.forEach((entity) => {
      this.clearCategoryReview(entity);
    });

    await this.repository.save(entities);

    return {
      count: entities.length,
      transactionIds: entities.map((entity) => entity.id),
    };
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
          const primaryCategory =
            transaction.effectiveCategory?.primary ?? null;
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

  async searchForSurface(
    userId: string,
    options: TransactionSurfaceSearchOptions,
  ): Promise<TransactionSurfaceSearchResult> {
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
        categoryPrimary: transaction.effectiveCategory?.primary ?? null,
        amount: transaction.amount,
      })),
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

            const syncUpdateDto =
              (existing.categoryReviewedAt ?? null) === null
                ? resolvedDto
                : { ...resolvedDto, categoryId: undefined };

            this.applyUpdate(existing, {
              ...syncUpdateDto,
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
