import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import {
  TransactionCreatedEvent,
  TransactionDeletedEvent,
  TransactionEvents,
  TransactionUpdatedEvent,
} from '../events/transaction.events';
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
    private readonly eventEmitter: EventEmitter2,
  ) {
    super(repository);
  }

  /**
   * Create a transaction and emit event to update account balance
   */
  async create(
    dto: CreateTransactionDto,
    userId: string,
  ): Promise<Transaction> {
    const transaction = await super.create(dto, userId);

    this.eventEmitter.emit(
      TransactionEvents.CREATED,
      new TransactionCreatedEvent(transaction),
    );

    return transaction;
  }

  /**
   * Update a transaction and emit event if amount changed
   */
  async update(
    id: string,
    dto: UpdateTransactionDto,
    userId: string,
  ): Promise<Transaction | null> {
    // Fetch the old transaction before updating
    const oldTransaction = await this.findOne(id, userId);
    if (!oldTransaction) {
      return null;
    }

    const newTransaction = await super.update(id, dto, userId);

    // Emit event if amount was updated
    if (newTransaction && dto.amount !== undefined) {
      this.eventEmitter.emit(
        TransactionEvents.UPDATED,
        new TransactionUpdatedEvent(oldTransaction, newTransaction),
      );
    }

    return newTransaction;
  }

  /**
   * Delete a transaction and emit event to reverse balance changes
   */
  async remove(id: string, userId: string): Promise<boolean> {
    // Fetch the transaction before deleting so we have data for the event
    const transaction = await this.findOne(id, userId);
    if (!transaction) {
      return false;
    }

    const deleted = await super.remove(id, userId);

    if (deleted) {
      this.eventEmitter.emit(
        TransactionEvents.DELETED,
        new TransactionDeletedEvent(transaction),
      );
    }

    return deleted;
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
}
