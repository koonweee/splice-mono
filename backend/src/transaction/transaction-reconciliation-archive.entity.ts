import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';

@Entity()
@Unique('UQ_transaction_reconciliation_archive_identity', [
  'userId',
  'accountId',
  'externalTransactionId',
])
@Index('IDX_transaction_reconciliation_archive_expiry', ['expiresAt'])
export class TransactionReconciliationArchiveEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar' })
  externalTransactionId: string;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  evidence: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  restoredAt: Date | null;
}
