import { CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Base entity with common timestamp fields.
 * Use this for entities that don't need user ownership (e.g., User itself).
 */
export abstract class TimestampedEntity {
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
