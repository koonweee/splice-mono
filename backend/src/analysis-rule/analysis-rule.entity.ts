import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';
import type {
  AnalysisCategoryScope,
  AnalysisRuleType,
} from '../types/AnalysisRule';

@Entity()
export class AnalysisRuleEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar' })
  type: AnalysisRuleType;

  @Column({ type: 'jsonb', nullable: true })
  excludeScope: AnalysisCategoryScope | null;

  @Column({ type: 'jsonb', nullable: true })
  inflowScope: AnalysisCategoryScope | null;

  @Column({ type: 'jsonb', nullable: true })
  outflowScope: AnalysisCategoryScope | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;
}
