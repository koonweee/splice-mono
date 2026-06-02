import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { CategoryEntity } from '../category/category.entity';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedEntity } from '../common/owned.entity';
import type {
  RecurringManualTransactionFrequency,
  RecurringManualTransactionSchedule,
} from '../types/RecurringManualTransaction';

@Entity()
@Index('IDX_recurring_manual_schedule_user_next', [
  'userId',
  'nextOccurrenceDate',
])
export class RecurringManualTransactionScheduleEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @ManyToOne(() => AccountEntity, { nullable: false })
  @JoinColumn({ name: 'accountId' })
  account: AccountEntity;

  @Column(() => BalanceColumns)
  amount: BalanceColumns;

  @Column({ type: 'varchar' })
  merchantName: string;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => CategoryEntity, { nullable: false })
  @JoinColumn({ name: 'categoryId' })
  category: CategoryEntity;

  @Column({ type: 'varchar', default: 'monthly' })
  frequency: RecurringManualTransactionFrequency;

  @Column({ type: 'integer' })
  dayOfMonth: number;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'date', nullable: true })
  nextOccurrenceDate: string | null;

  @Column({ type: 'date', nullable: true })
  lastGeneratedOccurrenceDate: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  pausedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  toObject(): RecurringManualTransactionSchedule {
    return {
      id: this.id,
      userId: this.userId,
      accountId: this.accountId,
      accountName: this.account
        ? (this.account.customName ?? this.account.name)
        : null,
      amount: this.amount.toMoneyWithSign(),
      merchantName: this.merchantName,
      categoryId: this.categoryId,
      category: this.category?.toObject() ?? null,
      frequency: this.frequency,
      dayOfMonth: this.dayOfMonth,
      startDate: this.startDate,
      endDate: this.endDate,
      nextOccurrenceDate: this.nextOccurrenceDate,
      lastGeneratedOccurrenceDate: this.lastGeneratedOccurrenceDate,
      pausedAt: this.pausedAt,
      archivedAt: this.archivedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
