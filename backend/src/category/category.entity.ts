import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
  cleanCategoryLabel,
  normalizeCategoryKey,
  normalizePlaidDetailedKey,
} from './category-normalization';
import { TimestampedEntity } from '../common/base.entity';
import { Category } from '../types/Category';

/**
 * Category entity for transaction categorization.
 * Plaid categories are global reference rows; user categories are scoped by userId.
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

  /** Category source: Plaid taxonomy or user-created */
  @Column({ type: 'varchar', default: 'plaid' })
  source: 'plaid' | 'user';

  /** Owning user for user-created categories */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /** Archive timestamp for user-created categories hidden from selectors */
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  setLabels(primary: string, detailed: string): void {
    this.primary = cleanCategoryLabel(primary);
    this.detailed = cleanCategoryLabel(detailed);
    this.normalizedPrimary = normalizeCategoryKey(this.primary);
    this.normalizedDetailed =
      this.source === 'plaid'
        ? normalizePlaidDetailedKey(this.primary, this.detailed)
        : normalizeCategoryKey(this.detailed);
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
      source: this.source,
      userId: this.userId,
      archivedAt: this.archivedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
