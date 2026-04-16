import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';

@Entity()
@Unique(['providerName', 'providerSymbol'])
export class SecurityInstrumentEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  @Index()
  symbol: string;

  @Column({ type: 'varchar' })
  providerName: string;

  @Column({ type: 'varchar' })
  providerSymbol: string;

  @Column({ type: 'varchar', nullable: true })
  exchange: string | null;

  @Column({ type: 'varchar' })
  priceCurrency: string;

  @Column({ type: 'varchar', nullable: true })
  displayName: string | null;
}
