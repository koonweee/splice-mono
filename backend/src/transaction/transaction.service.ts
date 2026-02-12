import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { CategoryEntity } from '../category/category.entity';
import type { TransactionSyncResponse } from '../types/BankLink';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import {
  CreateTransactionDto,
  Transaction,
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

  private static readonly SORTABLE_COLUMNS = new Set([
    'date',
    'merchantName',
    'pending',
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
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

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

    const [entities, total] = await this.repository.findAndCount({
      where,
      relations: this.relations,
      order: { [sortColumn]: order },
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
