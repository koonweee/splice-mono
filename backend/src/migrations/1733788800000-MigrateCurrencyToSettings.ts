import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to convert the currency column to a settings JSONB column
 *
 * This migration:
 * 1. Adds a new 'settings' JSONB column with default value
 * 2. Migrates existing currency values into the settings object
 * 3. Drops the old currency column
 */
export class MigrateCurrencyToSettings1733788800000
  implements MigrationInterface
{
  name = 'MigrateCurrencyToSettings1733788800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add the new settings column with default value
    await queryRunner.query(`
      ALTER TABLE user_entity
      ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{"currency":"USD"}'::jsonb
    `);

    // Migrate existing currency values into settings
    await queryRunner.query(`
      UPDATE user_entity
      SET settings = jsonb_build_object('currency', currency)
      WHERE currency IS NOT NULL
    `);

    // Drop the old currency column
    await queryRunner.query(`
      ALTER TABLE user_entity
      DROP COLUMN IF EXISTS currency
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the currency column
    await queryRunner.query(`
      ALTER TABLE user_entity
      ADD COLUMN IF NOT EXISTS currency varchar DEFAULT 'USD'
    `);

    // Migrate settings.currency back to the currency column
    await queryRunner.query(`
      UPDATE user_entity
      SET currency = settings->>'currency'
      WHERE settings IS NOT NULL AND settings->>'currency' IS NOT NULL
    `);

    // Drop the settings column
    await queryRunner.query(`
      ALTER TABLE user_entity
      DROP COLUMN IF EXISTS settings
    `);
  }
}
