import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { AccountActivityEntity } from '../account-activity/account-activity.entity';
import { CategoryEntity } from '../category/category.entity';
import { formatProviderCategoryDisplayLabel } from '../category/category-normalization';
import { BalanceColumns } from '../common/balance.columns';
import { TimestampedEntity } from '../common/base.entity';
import { CreateTransactionDto, Transaction } from '../types/Transaction';
import type {
  CategoryAssignmentSource,
  TransactionSource,
} from '../types/Transaction';
import { getTransactionActivityDate } from './transaction-date';

@Entity()
@Index('UQ_banking_transaction_activity', ['activityId'], { unique: true })
export class BankingTransactionEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  activityId: string;

  @OneToOne(() => AccountActivityEntity, {
    nullable: false,
    cascade: ['insert', 'update'],
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'activityId' })
  activity: AccountActivityEntity;

  /** Transaction origin: provider sync or user-created manual entry */
  @Column({ type: 'varchar', default: 'provider' })
  source: TransactionSource;

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

  /** Provider that supplied the raw category hint */
  @Column({ type: 'varchar', nullable: true })
  providerCategoryProvider: 'plaid' | null;

  /** Raw provider primary category code */
  @Column({ type: 'varchar', nullable: true })
  providerCategoryPrimary: string | null;

  /** Raw provider detailed category code */
  @Column({ type: 'varchar', nullable: true })
  providerCategoryDetailed: string | null;

  /** Provider-extracted counterparties for this transaction */
  @Column({ type: 'jsonb', nullable: true })
  counterparties: Array<Record<string, unknown>> | null;

  /** Provider location metadata for this transaction */
  @Column({ type: 'jsonb', nullable: true })
  location: Record<string, unknown> | null;

  /** Provider payment metadata for this transaction */
  @Column({ type: 'jsonb', nullable: true })
  paymentMeta: Record<string, unknown> | null;

  /** Raw provider payload for this banking transaction */
  @Column({ type: 'jsonb', nullable: true })
  providerPayload: Record<string, unknown> | null;

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

  /** When the effective app category assignment was last updated */
  @Column({ type: 'timestamptz', nullable: true })
  categoryUpdatedAt: Date | null;

  /** Effective category assignment source */
  @Column({ type: 'varchar', nullable: true })
  categoryAssignmentSource: CategoryAssignmentSource | null;

  /** Rule that assigned the effective category, when source is rule */
  @Column({ type: 'uuid', nullable: true })
  categoryAssignmentRuleId: string | null;

  get userId(): string {
    return this.activity.userId;
  }

  set userId(value: string) {
    this.ensureActivity().userId = value;
  }

  get amount(): BalanceColumns {
    return this.activity.amount;
  }

  set amount(value: BalanceColumns) {
    this.ensureActivity().amount = value;
  }

  get accountId(): string {
    return this.activity.accountId;
  }

  set accountId(value: string) {
    this.ensureActivity().accountId = value;
  }

  get account(): AccountEntity {
    return this.activity.account;
  }

  set account(value: AccountEntity) {
    this.ensureActivity().account = value;
  }

  get externalTransactionId(): string | null {
    return this.activity.externalActivityId;
  }

  set externalTransactionId(value: string | null) {
    this.ensureActivity().externalActivityId = value;
  }

  get providerDate(): string {
    return this.activity.providerDate;
  }

  set providerDate(value: string) {
    this.ensureActivity().providerDate = value;
  }

  get providerDatetime(): string | null {
    return this.activity.providerDatetime;
  }

  set providerDatetime(value: string | null) {
    this.ensureActivity().providerDatetime = value;
  }

  private ensureActivity(): AccountActivityEntity {
    if (!this.activity) {
      this.activity = new AccountActivityEntity();
      this.activity.activityKind = 'banking_transaction';
      this.activity.provider = 'plaid';
      this.activity.externalActivityId = null;
    }
    return this.activity;
  }

  static fromDto(
    dto: CreateTransactionDto,
    userId: string,
  ): BankingTransactionEntity {
    const entity = new BankingTransactionEntity();
    entity.activity = AccountActivityEntity.create({
      userId,
      accountId: dto.accountId,
      provider: 'plaid',
      externalActivityId: dto.externalTransactionId ?? null,
      activityKind: 'banking_transaction',
      activityDate:
        dto.reportingDateOverride ?? dto.authorizedDate ?? dto.providerDate,
      providerDate: dto.providerDate,
      providerDatetime: dto.providerDatetime ?? null,
      amount: dto.amount,
    });
    entity.source = 'provider';
    entity.applyBankingDto(dto);
    entity.categoryId = dto.categoryId ?? null;
    entity.categoryUpdatedAt = null;
    entity.categoryAssignmentSource = null;
    entity.categoryAssignmentRuleId = null;
    return entity;
  }

  applyBankingDto(dto: CreateTransactionDto): void {
    this.merchantName = dto.merchantName ?? null;
    this.providerTransactionName = dto.providerTransactionName ?? null;
    this.originalDescription = dto.originalDescription ?? null;
    this.pending = dto.pending;
    this.pendingTransactionId = dto.pendingTransactionId ?? null;
    this.accountOwner = dto.accountOwner ?? null;
    this.logoUrl = dto.logoUrl ?? null;
    this.website = dto.website ?? null;
    this.merchantEntityId = dto.merchantEntityId ?? null;
    this.paymentChannel = dto.paymentChannel ?? null;
    this.transactionCode = dto.transactionCode ?? null;
    this.personalFinanceCategoryIconUrl =
      dto.personalFinanceCategoryIconUrl ?? null;
    this.personalFinanceCategoryConfidenceLevel =
      dto.personalFinanceCategoryConfidenceLevel ?? null;
    this.applyProviderCategoryHint(dto);
    this.counterparties = dto.counterparties ?? null;
    this.location = dto.location ?? null;
    this.paymentMeta = dto.paymentMeta ?? null;
    this.providerPayload = dto.providerPayload ?? null;
    this.authorizedDate = dto.authorizedDate ?? null;
    this.authorizedDatetime = dto.authorizedDatetime ?? null;
    this.reportingDateOverride = dto.reportingDateOverride ?? null;
  }

  applyProviderCategoryHint(
    dto: Pick<CreateTransactionDto, 'personalFinanceCategory'>,
  ): void {
    const hint = dto.personalFinanceCategory;
    const hasHint = Boolean(hint?.primary || hint?.detailed);
    this.providerCategoryProvider = hasHint ? 'plaid' : null;
    this.providerCategoryPrimary = hint?.primary ?? null;
    this.providerCategoryDetailed = hint?.detailed ?? null;
  }

  toObject(): Transaction {
    const category = this.category ? this.category.toObject() : null;
    const providerCategoryHint = this.providerCategoryProvider
      ? {
          provider: this.providerCategoryProvider,
          primary: this.providerCategoryPrimary,
          detailed: this.providerCategoryDetailed,
          displayLabel: formatProviderCategoryDisplayLabel(
            this.providerCategoryPrimary,
            this.providerCategoryDetailed,
          ),
          confidenceLevel: this.personalFinanceCategoryConfidenceLevel,
          iconUrl: this.personalFinanceCategoryIconUrl,
        }
      : null;

    return {
      id: this.id,
      userId: this.userId,
      source: this.source ?? 'provider',
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
      categoryUpdatedAt: this.categoryUpdatedAt,
      categoryAssignmentSource: this.categoryAssignmentSource,
      categoryAssignmentRuleId: this.categoryAssignmentRuleId,
      providerCategoryHint,
      accountName: this.account
        ? (this.account.customName ?? this.account.name)
        : null,
      createdAt: this.activity.createdAt ?? this.createdAt,
      updatedAt: this.activity.updatedAt ?? this.updatedAt,
    };
  }
}

export { BankingTransactionEntity as TransactionEntity };
