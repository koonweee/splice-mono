import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../../common/base.entity';
import type { CategorizationRuleCondition } from '../../types/CategorizationRule';
import type { CategorizationRuleSuggestionStatus } from '../../types/CategorizationRuleSuggestion';
import type { Transaction } from '../../types/Transaction';

export type StoredCategorizationRuleSuggestionStatus =
  | CategorizationRuleSuggestionStatus
  | 'expired';

@Entity()
export class CategorizationRuleSuggestionEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  generationId: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'uuid' })
  targetCategoryId: string;

  @Column({ type: 'integer' })
  priority: number;

  @Column({ type: 'jsonb' })
  conditions: CategorizationRuleCondition[];

  @Column({ type: 'text' })
  rationale: string;

  @Column({ type: 'varchar' })
  status: StoredCategorizationRuleSuggestionStatus;

  @Column({ type: 'uuid', nullable: true })
  acceptedRuleId: string | null;

  @Column({ type: 'integer' })
  matched: number;

  @Column({ type: 'integer' })
  updated: number;

  @Column({ type: 'integer' })
  skippedManual: number;

  @Column({ type: 'integer' })
  manualAgreement: number;

  @Column({ type: 'integer' })
  manualConflicts: number;

  @Column({ type: 'integer' })
  existingRuleOverlap: number;

  @Column({ type: 'jsonb' })
  previewTransactions: Transaction[];

  @Column({ type: 'varchar' })
  generatedBy: 'mastra';

  @Column({ type: 'varchar' })
  model: string;
}
