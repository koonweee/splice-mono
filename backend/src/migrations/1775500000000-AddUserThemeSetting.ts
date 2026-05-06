import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_SETTINGS =
  '{"currency":"USD","timezone":"UTC","hideZeroBalanceAccounts":false,"theme":"splice-dark"}';

export class AddUserThemeSetting1775500000000 implements MigrationInterface {
  name = 'AddUserThemeSetting1775500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "user_entity"
       SET "settings" = "settings" || '{"theme":"splice-dark"}'::jsonb
       WHERE NOT ("settings" ? 'theme')`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "settings" SET DEFAULT '${DEFAULT_SETTINGS}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "settings" SET DEFAULT '{"currency":"USD","timezone":"UTC"}'`,
    );
    await queryRunner.query(
      `UPDATE "user_entity" SET "settings" = "settings" - 'theme'`,
    );
  }
}
