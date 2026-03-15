import { parse } from 'csv-parse/sync';
import { MigrationInterface, QueryRunner } from 'typeorm';

const PLAID_TAXONOMY_URL =
  'https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv';

/**
 * Seeds the category_entity table with Plaid's personal_finance_category taxonomy.
 * Fetches the canonical CSV at migration time and inserts records idempotently.
 */
export class SeedCategories1773607000000 implements MigrationInterface {
  name = 'SeedCategories1773607000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const response = await fetch(PLAID_TAXONOMY_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Plaid taxonomy CSV: ${response.status} ${response.statusText}`,
      );
    }
    const csvText = await response.text();

    const records: string[][] = parse(csvText, {
      skip_empty_lines: true,
      from_line: 2,
    });

    if (records.length === 0) {
      throw new Error('Plaid taxonomy CSV returned no records');
    }

    const values: string[] = [];
    const params: string[] = [];
    records.forEach((row, i) => {
      const offset = i * 3;
      values.push(
        `(uuid_generate_v4(), $${offset + 1}, $${offset + 2}, $${offset + 3})`,
      );
      params.push(row[0], row[1], row[2]);
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
  }
}
