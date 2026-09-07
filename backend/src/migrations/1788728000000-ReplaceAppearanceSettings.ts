import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceAppearanceSettings1788728000000
  implements MigrationInterface
{
  name = 'ReplaceAppearanceSettings1788728000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE user_entity SET settings =
      ((CASE WHEN jsonb_typeof(settings) = 'object' THEN settings ELSE '{}'::jsonb END) - 'theme') ||
      '{"appearance":{"mode":"dark","accent":"#83b59b"}}'::jsonb`);
    await queryRunner.query(
      `ALTER TABLE user_entity ALTER COLUMN settings SET DEFAULT '{"currency":"USD","timezone":"UTC","hideZeroBalanceAccounts":false,"appearance":{"mode":"dark","accent":"#83b59b"},"neutralizationLookaroundDays":60,"analysisSankeyEnabled":false,"notifications":{"transactions":{"newSyncedTransactions":true},"bankLinks":{"needsAttention":true}}}'::jsonb`,
    );
  }

  down(): Promise<void> {
    // The previous selections were intentionally reset, not mapped. Do not
    // pretend a schema rollback can recover information this migration deletes.
    return Promise.reject(
      new Error(
        'Appearance reset is irreversible. Restore a settings backup or explicitly reset preferences before reverting application code.',
      ),
    );
  }
}
