import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedEntity } from '../common/owned.entity';
import {
  ManualInvestmentSnapshot,
  ReplaceManualInvestmentSnapshotDto,
} from '../types/ManualInvestment';
import { ManualInvestmentHoldingEntity } from './manual-investment-holding.entity';

@Entity()
@Unique(['accountId', 'snapshotDate'])
export class ManualInvestmentSnapshotEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @ManyToOne(() => AccountEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account: AccountEntity;

  @Column({ type: 'date' })
  snapshotDate: string;

  @Column(() => BalanceColumns)
  cashBalance: BalanceColumns;

  @OneToMany(
    () => ManualInvestmentHoldingEntity,
    (holding) => holding.snapshot,
    { cascade: true },
  )
  holdings: ManualInvestmentHoldingEntity[];

  static fromDto(
    dto: ReplaceManualInvestmentSnapshotDto & {
      accountId: string;
      snapshotDate: string;
    },
    userId: string,
  ): ManualInvestmentSnapshotEntity {
    const entity = new ManualInvestmentSnapshotEntity();
    entity.userId = userId;
    entity.accountId = dto.accountId;
    entity.snapshotDate = dto.snapshotDate;
    entity.cashBalance = BalanceColumns.fromMoneyWithSign(dto.cashBalance);
    entity.holdings = [];
    return entity;
  }

  toObject(): ManualInvestmentSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      accountId: this.accountId,
      snapshotDate: this.snapshotDate,
      cashBalance: this.cashBalance.toMoneyWithSign(),
      holdings: this.holdings?.map((holding) => holding.toObject()) ?? [],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
