import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';
import { numericTransformer } from './manual-investment.transformers';
import { SecurityInstrumentEntity } from './security-instrument.entity';

@Entity()
@Unique(['instrumentId', 'priceDate'])
export class SecurityPriceDailyEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  instrumentId: string;

  @ManyToOne(() => SecurityInstrumentEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'instrumentId' })
  instrument: SecurityInstrumentEntity;

  @Column({ type: 'date' })
  @Index()
  priceDate: string;

  @Column({
    type: 'numeric',
    precision: 20,
    scale: 8,
    transformer: numericTransformer,
  })
  closePrice: number;

  @Column({ type: 'varchar' })
  priceCurrency: string;
}
