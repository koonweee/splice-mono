import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OwnedEntity } from '../common/owned.entity';
import { TransactionEntity } from '../transaction/transaction.entity';
import type { RecurringManualTransactionOccurrence } from '../types/RecurringManualTransaction';
import { RecurringManualTransactionScheduleEntity } from './recurring-manual-transaction-schedule.entity';

@Entity()
@Index(
  'UQ_recurring_manual_occurrence_schedule_date',
  ['scheduleId', 'occurrenceDate'],
  {
    unique: true,
  },
)
export class RecurringManualTransactionOccurrenceEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  scheduleId: string;

  @ManyToOne(() => RecurringManualTransactionScheduleEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'scheduleId' })
  schedule: RecurringManualTransactionScheduleEntity;

  @Column({ type: 'date' })
  occurrenceDate: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => TransactionEntity, { nullable: false })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Column({ type: 'timestamptz' })
  generatedAt: Date;

  toObject(): RecurringManualTransactionOccurrence {
    return {
      id: this.id,
      userId: this.userId,
      scheduleId: this.scheduleId,
      occurrenceDate: this.occurrenceDate,
      transactionId: this.transactionId,
      generatedAt: this.generatedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
