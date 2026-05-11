import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_SETTINGS =
  '{"currency":"USD","timezone":"UTC","hideZeroBalanceAccounts":false,"theme":"splice-dark","neutralizationLookaroundDays":60}';

export class AddNeutralizationLookaroundSetting1776400000000
  implements MigrationInterface
{
  name = 'AddNeutralizationLookaroundSetting1776400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "user_entity"
       SET "settings" = "settings" || '{"neutralizationLookaroundDays":60}'::jsonb
       WHERE NOT ("settings" ? 'neutralizationLookaroundDays')`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "settings" SET DEFAULT '${DEFAULT_SETTINGS}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "settings" SET DEFAULT '{"currency":"USD","timezone":"UTC","hideZeroBalanceAccounts":false,"theme":"splice-dark"}'`,
    );
    await queryRunner.query(
      `UPDATE "user_entity" SET "settings" = "settings" - 'neutralizationLookaroundDays'`,
    );
  }
}
