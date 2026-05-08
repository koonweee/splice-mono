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
import {
  CreateTransactionDto,
  Transaction,
  TransactionCategoryReviewMethod,
} from '../types/Transaction';
import { getTransactionActivityDate } from './transaction-date';

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

  /** Provider's raw transaction name/description */
  @Column({ type: 'varchar', nullable: true })
  providerTransactionName: string | null;

  /** Original transaction description from the financial institution */
  @Column({ type: 'varchar', nullable: true })
  originalDescription: string | null;

  /** Whether the transaction is pending (unsettled) */
  @Column({ type: 'boolean' })
  pending: boolean;

  /** Provider ID of the related pending transaction, when available */
  @Column({ type: 'varchar', nullable: true })
  pendingTransactionId: string | null;

  /** Account owner supplied by the provider, when available */
  @Column({ type: 'varchar', nullable: true })
  accountOwner: string | null;

  /** External transaction ID from provider (e.g., Plaid transaction_id) */
  @Column({ type: 'varchar', nullable: true })
  externalTransactionId: string | null;

  /** Logo URL for the merchant */
  @Column({ type: 'varchar', nullable: true })
  logoUrl: string | null;

  /** Website URL associated with the merchant */
  @Column({ type: 'varchar', nullable: true })
  website: string | null;

  /** Stable provider merchant entity ID */
  @Column({ type: 'varchar', nullable: true })
  merchantEntityId: string | null;

  /** Channel used to make the payment */
  @Column({ type: 'varchar', nullable: true })
  paymentChannel: string | null;

  /** Provider transaction code */
  @Column({ type: 'varchar', nullable: true })
  transactionCode: string | null;

  /** Icon URL for the provider's personal finance category */
  @Column({ type: 'varchar', nullable: true })
  personalFinanceCategoryIconUrl: string | null;

  /** Provider confidence level for the personal finance category */
  @Column({ type: 'varchar', nullable: true })
  personalFinanceCategoryConfidenceLevel: string | null;

  /** Provider-extracted counterparties for this transaction */
  @Column({ type: 'jsonb', nullable: true })
  counterparties: Array<Record<string, unknown>> | null;

  /** Provider location metadata for this transaction */
  @Column({ type: 'jsonb', nullable: true })
  location: Record<string, unknown> | null;

  /** Provider payment metadata for this transaction */
  @Column({ type: 'jsonb', nullable: true })
  paymentMeta: Record<string, unknown> | null;

  /** Provider transaction date - occurrence date for pending, posted date for posted */
  @Column({ type: 'date' })
  providerDate: string;

  /** Provider transaction datetime with time info */
  @Column({ type: 'timestamptz', nullable: true })
  providerDatetime: string | null;

  /** Date the transaction was authorized (yyyy-mm-dd) */
  @Column({ type: 'date', nullable: true })
  authorizedDate: string | null;

  /** Datetime the transaction was authorized */
  @Column({ type: 'timestamptz', nullable: true })
  authorizedDatetime: string | null;

  /** User-selected date for reporting and analysis grouping */
  @Column({ type: 'date', nullable: true })
  reportingDateOverride: string | null;

  /** Foreign key for Category (optional) */
  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  /** Many transactions can have one Category */
  @ManyToOne(() => CategoryEntity, { nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category: CategoryEntity | null;

  /** User-selected category override ID */
  @Column({ type: 'uuid', nullable: true })
  userCategoryId: string | null;

  /** User-selected category override */
  @ManyToOne(() => CategoryEntity, { nullable: true })
  @JoinColumn({ name: 'userCategoryId' })
  userCategory: CategoryEntity | null;

  /** When the user-selected category override was last updated */
  @Column({ type: 'timestamptz', nullable: true })
  userCategoryUpdatedAt: Date | null;

  /** When the category was reviewed by the user */
  @Column({ type: 'timestamptz', nullable: true })
  categoryReviewedAt: Date | null;

  /** How the category review was completed */
  @Column({ type: 'varchar', nullable: true })
  categoryReviewMethod: TransactionCategoryReviewMethod | null;

  /**
   * Create entity from DTO
   */
  static fromDto(dto: CreateTransactionDto, userId: string): TransactionEntity {
    const entity = new TransactionEntity();
    entity.userId = userId;
    entity.amount = BalanceColumns.fromMoneyWithSign(dto.amount);
    entity.accountId = dto.accountId;
    entity.merchantName = dto.merchantName ?? null;
    entity.providerTransactionName = dto.providerTransactionName ?? null;
    entity.originalDescription = dto.originalDescription ?? null;
    entity.pending = dto.pending;
    entity.pendingTransactionId = dto.pendingTransactionId ?? null;
    entity.accountOwner = dto.accountOwner ?? null;
    entity.externalTransactionId = dto.externalTransactionId ?? null;
    entity.logoUrl = dto.logoUrl ?? null;
    entity.website = dto.website ?? null;
    entity.merchantEntityId = dto.merchantEntityId ?? null;
    entity.paymentChannel = dto.paymentChannel ?? null;
    entity.transactionCode = dto.transactionCode ?? null;
    entity.personalFinanceCategoryIconUrl =
      dto.personalFinanceCategoryIconUrl ?? null;
    entity.personalFinanceCategoryConfidenceLevel =
      dto.personalFinanceCategoryConfidenceLevel ?? null;
    entity.counterparties = dto.counterparties ?? null;
    entity.location = dto.location ?? null;
    entity.paymentMeta = dto.paymentMeta ?? null;
    entity.providerDate = dto.providerDate;
    entity.providerDatetime = dto.providerDatetime ?? null;
    entity.authorizedDate = dto.authorizedDate ?? null;
    entity.authorizedDatetime = dto.authorizedDatetime ?? null;
    entity.reportingDateOverride = dto.reportingDateOverride ?? null;
    entity.categoryId = dto.categoryId ?? null;
    entity.userCategoryId = null;
    entity.userCategory = null;
    entity.userCategoryUpdatedAt = null;
    entity.categoryReviewedAt = null;
    entity.categoryReviewMethod = null;
    return entity;
  }

  /**
   * Convert entity to domain object
   */
  toObject(): Transaction {
    const category = this.category ? this.category.toObject() : null;
    const userCategory = this.userCategory
      ? this.userCategory.toObject()
      : null;
    const effectiveCategory = userCategory ?? category;

    return {
      id: this.id,
      userId: this.userId,
      amount: this.amount.toMoneyWithSign(),
      accountId: this.accountId,
      merchantName: this.merchantName,
      providerTransactionName: this.providerTransactionName,
      originalDescription: this.originalDescription,
      pending: this.pending,
      pendingTransactionId: this.pendingTransactionId,
      accountOwner: this.accountOwner,
      externalTransactionId: this.externalTransactionId,
      logoUrl: this.logoUrl,
      website: this.website,
      merchantEntityId: this.merchantEntityId,
      paymentChannel: this.paymentChannel,
      transactionCode: this.transactionCode,
      personalFinanceCategoryIconUrl: this.personalFinanceCategoryIconUrl,
      personalFinanceCategoryConfidenceLevel:
        this.personalFinanceCategoryConfidenceLevel,
      counterparties: this.counterparties,
      location: this.location,
      paymentMeta: this.paymentMeta,
      activityDate: getTransactionActivityDate(this),
      reportingDateOverride: this.reportingDateOverride,
      providerDate: this.providerDate,
      providerDatetime: this.providerDatetime,
      authorizedDate: this.authorizedDate,
      authorizedDatetime: this.authorizedDatetime,
      categoryId: this.categoryId,
      category,
      userCategoryId: this.userCategoryId,
      userCategory,
      userCategoryUpdatedAt: this.userCategoryUpdatedAt,
      effectiveCategoryId: this.userCategoryId ?? this.categoryId,
      effectiveCategory,
      categoryReviewedAt: this.categoryReviewedAt ?? null,
      categoryReviewMethod: this.categoryReviewMethod ?? null,
      categoryNeedsReview: (this.categoryReviewedAt ?? null) === null,
      accountName: this.account
        ? (this.account.customName ?? this.account.name)
        : null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
