import { AccountSubtype, AccountType } from 'plaid';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BankLinkEntity } from '../bank-link/bank-link.entity';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedEntity } from '../common/owned.entity';
import { Account, CreateAccountDto } from '../types/Account';
import type { APIAccount } from '../types/BankLink';

@Entity()
export class AccountEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  /** User-defined custom name override. When set, displayed instead of the synced name. */
  @Column({ type: 'varchar', nullable: true })
  customName: string | null;

  /** Mask of account number (e.g., last 4 digits) */
  @Column({ type: 'varchar', nullable: true })
  mask: string | null;

  /** Available balance */
  @Column(() => BalanceColumns)
  availableBalance: BalanceColumns;

  /** Current balance */
  @Column(() => BalanceColumns)
  currentBalance: BalanceColumns;

  @Column()
  type: string;

  @Column({ type: 'varchar', nullable: true })
  subType: string | null;

  /** External account ID from bank provider (e.g., Plaid account_id) */
  @Column({ type: 'varchar', nullable: true })
  externalAccountId: string | null;

  /** Raw API account data from provider */
  @Column({ type: 'jsonb', nullable: true })
  rawApiAccount: APIAccount | null;

  /** Manual investment valuation mode for manual investment accounts */
  @Column({ type: 'varchar', nullable: true })
  manualValuationMode: string | null;

  /** Timestamp when the user last changed holdings snapshots */
  @Column({ type: 'timestamptz', nullable: true })
  lastUserSnapshotAt: Date | null;

  /** Timestamp when the holdings were last valued successfully */
  @Column({ type: 'timestamptz', nullable: true })
  lastValuationAt: Date | null;

  /** Foreign key for BankLink - set this directly to associate */
  @Column({ type: 'uuid', nullable: true })
  bankLinkId: string | null;

  /** Many accounts can belong to one BankLink */
  @ManyToOne(() => BankLinkEntity, { nullable: true })
  @JoinColumn({ name: 'bankLinkId' })
  bankLink: BankLinkEntity | null;

  /**
   * Create entity from DTO
   */
  static fromDto(dto: CreateAccountDto, userId: string): AccountEntity {
    const entity = new AccountEntity();
    entity.userId = userId;
    entity.name = dto.name;
    entity.customName = dto.customName ?? null;
    entity.mask = dto.mask ?? null;
    entity.availableBalance = BalanceColumns.fromMoneyWithSign(
      dto.availableBalance,
    );
    entity.currentBalance = BalanceColumns.fromMoneyWithSign(
      dto.currentBalance,
    );
    entity.type = dto.type;
    entity.subType = dto.subType;
    entity.externalAccountId = dto.externalAccountId ?? null;
    entity.manualValuationMode = dto.manualValuationMode ?? null;
    entity.lastUserSnapshotAt = null;
    entity.lastValuationAt = null;
    entity.bankLinkId = dto.bankLinkId ?? null;
    entity.rawApiAccount = dto.rawApiAccount ?? null;
    return entity;
  }

  /**
   * Convert entity to domain object
   */
  toObject(): Account {
    return {
      id: this.id,
      userId: this.userId,
      name: this.name,
      customName: this.customName,
      mask: this.mask,
      availableBalance: this.availableBalance.toMoneyWithSign(),
      currentBalance: this.currentBalance.toMoneyWithSign(),
      type: this.type as AccountType,
      subType: this.subType ? (this.subType as AccountSubtype) : null,
      externalAccountId: this.externalAccountId,
      manualValuationMode: this.manualValuationMode as
        | Account['manualValuationMode']
        | undefined,
      lastUserSnapshotAt: this.lastUserSnapshotAt,
      lastValuationAt: this.lastValuationAt,
      bankLinkId: this.bankLinkId,
      bankLink: this.bankLink?.toObject() ?? null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
