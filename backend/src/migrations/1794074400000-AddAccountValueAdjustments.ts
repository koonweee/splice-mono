import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountValueAdjustments1794074400000
  implements MigrationInterface
{
  name = 'AddAccountValueAdjustments1794074400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE account_entity
      ADD COLUMN "expectedValuePercent" numeric NOT NULL DEFAULT 100,
      ADD COLUMN "expectedTaxPercent" numeric NOT NULL DEFAULT 0,
      ADD CONSTRAINT "CHK_account_expected_value" CHECK (
        "expectedValuePercent" > 0 AND "expectedValuePercent" NOT IN ('NaN'::numeric, 'Infinity'::numeric)
      ),
      ADD CONSTRAINT "CHK_account_expected_tax" CHECK (
        "expectedTaxPercent" >= 0 AND "expectedTaxPercent" <= 100
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE account_entity
      DROP COLUMN "expectedValuePercent", DROP COLUMN "expectedTaxPercent"`);
  }
}
