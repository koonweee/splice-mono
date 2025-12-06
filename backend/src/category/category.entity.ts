import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Category } from '../types/Category';

/**
 * Category entity for transaction categorization.
 * This is a reference entity - categories are global/shared across all users.
 */
@Entity()
export class CategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Primary category (e.g., "Food and Drink") */
  @Column({ type: 'varchar' })
  primary: string;

  /** Detailed category (e.g., "Restaurants") */
  @Column({ type: 'varchar' })
  detailed: string;

  /** Description of the category */
  @Column({ type: 'varchar' })
  description: string;

  /**
   * Convert entity to domain object
   */
  toObject(): Category {
    return {
      id: this.id,
      primary: this.primary,
      detailed: this.detailed,
      description: this.description,
    };
  }
}
