import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CategoryEntity } from '../category/category.entity';
import type { TransactionSyncResponse } from '../types/BankLink';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import {
  CreateTransactionDto,
  PaginatedTransactions,
  Transaction,
  TransactionFilterDto,
  UpdateTransactionDto,
} from '../types/Transaction';
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

  /**
   * Find all transactions owned by the specified user, sorted by date descending.
   */
  override async findAll(userId: string): Promise<Transaction[]> {
    this.logger.log(
      { userId },
      `Finding all ${this.entityName}s sorted by date`,
    );

    const entities = await this.repository.find({
      where: { userId },
      relations: this.relations,
      order: { date: 'DESC', datetime: { direction: 'DESC', nulls: 'LAST' } },
    });

    this.logger.log(
      { userId, count: entities.length },
      `Found ${this.entityName}s`,
    );
    return entities.map((entity) => entity.toObject());
  }

  /**
   * Find transactions with filtering, search, and pagination using QueryBuilder.
   */
  async findFiltered(
    userId: string,
    filters: TransactionFilterDto,
  ): Promise<PaginatedTransactions> {
    const {
      page,
      limit,
      accountId,
      categoryId,
      startDate,
      endDate,
      search,
      minAmount,
      maxAmount,
    } = filters;

    this.logger.log({ userId, filters }, 'Finding filtered transactions');

    const qb = this.repository
      .createQueryBuilder('txn')
      .leftJoinAndSelect('txn.account', 'account')
      .leftJoinAndSelect('txn.category', 'category')
      .where('txn.userId = :userId', { userId });

    // Filter by account IDs
    if (accountId) {
      const accountIds = Array.isArray(accountId) ? accountId : [accountId];
      qb.andWhere('txn.accountId IN (:...accountIds)', { accountIds });
    }

    // Filter by category IDs
    if (categoryId) {
      const categoryIds = Array.isArray(categoryId) ? categoryId : [categoryId];
      qb.andWhere('txn.categoryId IN (:...categoryIds)', { categoryIds });
    }

    // Filter by date range
    if (startDate) {
      qb.andWhere('txn.date >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('txn.date <= :endDate', { endDate });
    }

    // Case-insensitive search on merchant name
    if (search) {
      qb.andWhere('txn.merchantName ILIKE :search', {
        search: `%${search}%`,
      });
    }

    // Filter by amount range (compare on the stored integer amount in cents)
    if (minAmount !== undefined) {
      qb.andWhere('txn.amountAmount >= :minAmount', {
        minAmount: Math.round(minAmount * 100),
      });
    }
    if (maxAmount !== undefined) {
      qb.andWhere('txn.amountAmount <= :maxAmount', {
        maxAmount: Math.round(maxAmount * 100),
      });
    }

    // Order by date descending
    qb.orderBy('txn.date', 'DESC').addOrderBy('txn.datetime', 'DESC');

    // Pagination
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    const [entities, total] = await qb.getManyAndCount();

    this.logger.log(
      { userId, total, page, limit },
      'Found filtered transactions',
    );

    return {
      data: entities.map((entity) => entity.toObject()),
      total,
      page,
      limit,
      hasMore: skip + entities.length < total,
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
