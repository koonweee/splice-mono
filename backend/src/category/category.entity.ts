import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
  cleanCategoryLabel,
  normalizeCategoryKey,
} from './category-normalization';
import { TimestampedEntity } from '../common/base.entity';
import { Category } from '../types/Category';

/**
 * Category entity for transaction categorization.
 * Categories are user-owned app categories scoped by userId.
 */
@Entity()
export class CategoryEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Primary category (e.g., "Food and Drink") */
  @Column({ type: 'varchar' })
  primary: string;

  /** Normalized primary label for duplicate checks */
  @Column({ type: 'varchar' })
  normalizedPrimary: string;

  /** Detailed category (e.g., "Restaurants") */
  @Column({ type: 'varchar' })
  detailed: string;

  /** Normalized detailed label for duplicate checks */
  @Column({ type: 'varchar' })
  normalizedDetailed: string;

  /** Description of the category */
  @Column({ type: 'varchar' })
  description: string;

  /** User-selected display color, stored as normalized hex */
  @Column({ type: 'varchar' })
  color: string;

  /** Owning user */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /** Archive timestamp for user-created categories hidden from selectors */
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  setLabels(primary: string, detailed: string): void {
    this.primary = cleanCategoryLabel(primary);
    this.detailed = cleanCategoryLabel(detailed);
    this.normalizedPrimary = normalizeCategoryKey(this.primary);
    this.normalizedDetailed = normalizeCategoryKey(this.detailed);
  }

  /**
   * Convert entity to domain object
   */
  toObject(): Category {
    return {
      id: this.id,
      primary: this.primary,
      detailed: this.detailed,
      description: this.description,
      color: this.color,
      archivedAt: this.archivedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
