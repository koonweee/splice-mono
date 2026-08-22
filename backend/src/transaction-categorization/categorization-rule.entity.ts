import { Column, Entity, PrimaryGeneratedColumn, VersionColumn } from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';
import type { CategorizationRuleCondition } from '../types/CategorizationRule';

@Entity()
export class CategorizationRuleEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'integer' })
  priority: number;

  @Column({ type: 'uuid' })
  targetCategoryId: string;

  @Column({ type: 'jsonb' })
  conditions: CategorizationRuleCondition[];

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @VersionColumn()
  revision: number;
}
