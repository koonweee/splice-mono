import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { CategoryEntity } from '../category/category.entity';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedEntity } from '../common/owned.entity';
import { CreateTransactionDto, Transaction } from '../types/Transaction';

@Entity()
@Unique(['accountId', 'externalTransactionId']) // Prevent duplicate imports from providers
export class TransactionEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Amount with sign and currency */
  @Column(() => BalanceColumns)
  amount: BalanceColumns;

  /** Foreign key for Account */
  @Column({ type: 'uuid' })
  accountId: string;

  /** Many transactions belong to one Account */
  @ManyToOne(() => AccountEntity, { nullable: false })
  @JoinColumn({ name: 'accountId' })
  account: AccountEntity;

  /** Merchant name (e.g., "Starbucks") */
  @Column({ type: 'varchar', nullable: true })
  merchantName: string | null;

  /** Whether the transaction is pending (unsettled) */
  @Column({ type: 'boolean' })
  pending: boolean;

  /** External transaction ID from provider (e.g., Plaid transaction_id) */
  @Column({ type: 'varchar', nullable: true })
  externalTransactionId: string | null;

  /** Logo URL for the merchant */
  @Column({ type: 'varchar', nullable: true })
  logoUrl: string | null;

  /** Transaction date (yyyy-mm-dd) - occurrence date for pending, posted date for posted */
  @Column({ type: 'date' })
  date: string;

  /** Transaction datetime with time info */
  @Column({ type: 'timestamptz', nullable: true })
  datetime: string | null;

  /** Date the transaction was authorized (yyyy-mm-dd) */
  @Column({ type: 'date', nullable: true })
  authorizedDate: string | null;

  /** Datetime the transaction was authorized */
  @Column({ type: 'timestamptz', nullable: true })
  authorizedDatetime: string | null;

  /** Foreign key for Category (optional) */
  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  /** Many transactions can have one Category */
  @ManyToOne(() => CategoryEntity, { nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category: CategoryEntity | null;

  /**
   * Create entity from DTO
   */
  static fromDto(dto: CreateTransactionDto, userId: string): TransactionEntity {
    const entity = new TransactionEntity();
    entity.userId = userId;
    entity.amount = BalanceColumns.fromMoneyWithSign(dto.amount);
    entity.accountId = dto.accountId;
    entity.merchantName = dto.merchantName ?? null;
    entity.pending = dto.pending;
    entity.externalTransactionId = dto.externalTransactionId ?? null;
    entity.logoUrl = dto.logoUrl ?? null;
    entity.date = dto.date;
    entity.datetime = dto.datetime ?? null;
    entity.authorizedDate = dto.authorizedDate ?? null;
    entity.authorizedDatetime = dto.authorizedDatetime ?? null;
    entity.categoryId = dto.categoryId ?? null;
    return entity;
  }

  /**
   * Convert entity to domain object
   */
  toObject(): Transaction {
    return {
      id: this.id,
      userId: this.userId,
      amount: this.amount.toMoneyWithSign(),
      accountId: this.accountId,
      merchantName: this.merchantName,
      pending: this.pending,
      externalTransactionId: this.externalTransactionId,
      logoUrl: this.logoUrl,
      date: this.date,
      datetime: this.datetime,
      authorizedDate: this.authorizedDate,
      authorizedDatetime: this.authorizedDatetime,
      categoryId: this.categoryId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
