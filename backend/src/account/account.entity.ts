import { AccountSubtype, AccountType } from 'plaid';
import {
  Column,
  Entity,
  Index,
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
@Index(
  'UQ_account_user_bank_link_external',
  ['userId', 'bankLinkId', 'externalAccountId'],
  {
    unique: true,
    where: '"bankLinkId" IS NOT NULL AND "externalAccountId" IS NOT NULL',
  },
)
export class AccountEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  /** User-defined custom name override. When set, displayed instead of the synced name. */
  @Column({ type: 'varchar', nullable: true })
  customName: string | null;

  /** User-authored notes for this account. */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

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

  /** When set, this account is hidden from default UI/account lists. */
  @Column({ type: 'timestamp', nullable: true })
  archivedAt: Date | null;

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
    entity.notes = dto.notes ?? null;
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
    entity.bankLinkId = dto.bankLinkId ?? null;
    entity.rawApiAccount = dto.rawApiAccount ?? null;
    entity.archivedAt = null;
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
      notes: this.notes,
      mask: this.mask,
      availableBalance: this.availableBalance.toMoneyWithSign(),
      currentBalance: this.currentBalance.toMoneyWithSign(),
      type: this.type as AccountType,
      subType: this.subType ? (this.subType as AccountSubtype) : null,
      externalAccountId: this.externalAccountId,
      bankLinkId: this.bankLinkId,
      bankLink: this.bankLink?.toObject() ?? null,
      archivedAt: this.archivedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
