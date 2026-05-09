import { MigrationInterface } from 'typeorm';

/**
 * Historical no-op.
 *
 * Provider categories are stored on transactions as providerCategoryHint
 * metadata, not as rows in category_entity.
 */
export class SeedCategories1773607000000 implements MigrationInterface {
  name = 'SeedCategories1773607000000';

  public async up(): Promise<void> {
    // Intentionally empty.
  }

  public async down(): Promise<void> {
    // Intentionally empty. Plaid taxonomy rows are no longer managed locally.
  }
}
