import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../../common/base.entity';
import type { CategorizationRuleSuggestionGenerationStatus } from '../../types/CategorizationRuleSuggestion';

@Entity()
export class CategorizationRuleSuggestionGenerationEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar' })
  status: CategorizationRuleSuggestionGenerationStatus;

  @Column({ type: 'varchar' })
  model: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  ignoredCategoryIds: string[];

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  failedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;
}
