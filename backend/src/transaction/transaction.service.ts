import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
  ) {
    super(repository);
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
            return TransactionEntity.fromDto(
              { ...dto, accountId: internalAccountId },
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
                  { ...dto, accountId: internalAccountId },
                  userId,
                ),
              );
              return;
            }

            this.applyUpdate(existing, {
              ...dto,
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
}
