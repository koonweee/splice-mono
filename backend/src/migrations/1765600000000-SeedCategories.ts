import { parse } from 'csv-parse/sync';
import { MigrationInterface, QueryRunner } from 'typeorm';

const PLAID_TAXONOMY_URL =
  'https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv';

/**
 * Seeds the category_entity table with Plaid's personal_finance_category taxonomy.
 * Fetches the canonical CSV from Plaid at migration time so data stays in sync.
 * Uses ON CONFLICT to be idempotent - safe to run multiple times.
 */
export class SeedCategories1765600000000 implements MigrationInterface {
  name = 'SeedCategories1765600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add a unique constraint on (primary, detailed) to support idempotent seeding
    await queryRunner.query(
      `ALTER TABLE "category_entity" ADD CONSTRAINT "UQ_category_primary_detailed" UNIQUE ("primary", "detailed")`,
    );

    // Fetch the taxonomy CSV from Plaid
    const response = await fetch(PLAID_TAXONOMY_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Plaid taxonomy CSV: ${response.status} ${response.statusText}`,
      );
    }
    const csvText = await response.text();

    // Parse CSV (columns: PRIMARY, DETAILED, DESCRIPTION)
    const records: string[][] = parse(csvText, {
      skip_empty_lines: true,
      from_line: 2, // skip header row
    });

    if (records.length === 0) {
      throw new Error('Plaid taxonomy CSV returned no records');
    }

    // Build parameterized INSERT with ON CONFLICT
    const values: string[] = [];
    const params: string[] = [];
    records.forEach((row, i) => {
      const offset = i * 3;
      values.push(
        `(gen_random_uuid(), $${offset + 1}, $${offset + 2}, $${offset + 3})`,
      );
      params.push(row[0], row[1], row[2]); // primary, detailed, description
    });

    await queryRunner.query(
      `INSERT INTO "category_entity" ("id", "primary", "detailed", "description")
       VALUES ${values.join(', ')}
       ON CONFLICT ("primary", "detailed") DO NOTHING`,
      params,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "category_entity"`);
    await queryRunner.query(
      `ALTER TABLE "category_entity" DROP CONSTRAINT "UQ_category_primary_detailed"`,
    );
  }
}
