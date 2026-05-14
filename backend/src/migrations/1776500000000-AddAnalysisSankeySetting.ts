import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_SETTINGS =
  '{"currency":"USD","timezone":"UTC","hideZeroBalanceAccounts":false,"theme":"splice-dark","neutralizationLookaroundDays":60,"analysisSankeyEnabled":false}';

export class AddAnalysisSankeySetting1776500000000
  implements MigrationInterface
{
  name = 'AddAnalysisSankeySetting1776500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "user_entity"
       SET "settings" = "settings" || '{"analysisSankeyEnabled":false}'::jsonb
       WHERE NOT ("settings" ? 'analysisSankeyEnabled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "settings" SET DEFAULT '${DEFAULT_SETTINGS}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "settings" SET DEFAULT '{"currency":"USD","timezone":"UTC","hideZeroBalanceAccounts":false,"theme":"splice-dark","neutralizationLookaroundDays":60}'`,
    );
    await queryRunner.query(
      `UPDATE "user_entity" SET "settings" = "settings" - 'analysisSankeyEnabled'`,
    );
  }
}
