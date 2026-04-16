import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';
import type { ManualInvestmentHolding } from '../types/ManualInvestment';
import { numericTransformer } from './manual-investment.transformers';
import { ManualInvestmentSnapshotEntity } from './manual-investment-snapshot.entity';
import { SecurityInstrumentEntity } from './security-instrument.entity';

@Entity()
@Unique(['snapshotId', 'instrumentId'])
export class ManualInvestmentHoldingEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  snapshotId: string;

  @ManyToOne(() => ManualInvestmentSnapshotEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'snapshotId' })
  snapshot: ManualInvestmentSnapshotEntity;

  @Column({ type: 'uuid' })
  instrumentId: string;

  @ManyToOne(() => SecurityInstrumentEntity, { nullable: false })
  @JoinColumn({ name: 'instrumentId' })
  instrument: SecurityInstrumentEntity;

  @Column({ type: 'varchar' })
  symbol: string;

  @Column({ type: 'varchar', nullable: true })
  displayName: string | null;

  @Column({ type: 'numeric', precision: 20, scale: 8, transformer: numericTransformer })
  quantity: number;

  toObject(): ManualInvestmentHolding {
    return {
      id: this.id,
      instrumentId: this.instrumentId,
      symbol: this.symbol,
      displayName: this.displayName,
      quantity: this.quantity,
    };
  }
}
