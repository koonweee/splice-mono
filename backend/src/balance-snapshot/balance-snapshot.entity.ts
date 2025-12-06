import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedEntity } from '../common/owned.entity';
import {
  BalanceSnapshot,
  BalanceSnapshotType,
  CreateBalanceSnapshotDto,
} from '../types/BalanceSnapshot';

@Entity()
@Unique(['accountId', 'snapshotDate']) // Enforce one snapshot per account per day
export class BalanceSnapshotEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Foreign key for Account */
  @Column({ type: 'uuid' })
  accountId: string;

  /** Many snapshots belong to one Account */
  @ManyToOne(() => AccountEntity, { nullable: false })
  @JoinColumn({ name: 'accountId' })
  account: AccountEntity;

  /** Date of snapshot (YYYY-MM-DD) - should be localized to user's timezone - combined with accountId for uniqueness */
  @Column({ type: 'date' })
  snapshotDate: string;

  /** Current balance at time of snapshot */
  @Column(() => BalanceColumns)
  currentBalance: BalanceColumns;

  /** Available balance at time of snapshot */
  @Column(() => BalanceColumns)
  availableBalance: BalanceColumns;

  /** How this snapshot was created */
  @Column({ type: 'varchar' })
  snapshotType: string;

  /**
   * Create entity from DTO
   */
  static fromDto(
    dto: CreateBalanceSnapshotDto,
    userId: string,
  ): BalanceSnapshotEntity {
    const entity = new BalanceSnapshotEntity();
    entity.userId = userId;
    entity.accountId = dto.accountId;
    entity.snapshotDate = dto.snapshotDate;
    entity.currentBalance = BalanceColumns.fromMoneyWithSign(
      dto.currentBalance,
    );
    entity.availableBalance = BalanceColumns.fromMoneyWithSign(
      dto.availableBalance,
    );
    entity.snapshotType = dto.snapshotType;
    return entity;
  }

  /**
   * Convert entity to domain object
   */
  toObject(): BalanceSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      accountId: this.accountId,
      snapshotDate: this.snapshotDate,
      currentBalance: this.currentBalance.toMoneyWithSign(),
      availableBalance: this.availableBalance.toMoneyWithSign(),
      snapshotType: this.snapshotType as BalanceSnapshotType,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
