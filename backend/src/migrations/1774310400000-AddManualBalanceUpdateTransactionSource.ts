import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManualBalanceUpdateTransactionSource1774310400000
  implements MigrationInterface
{
  name = 'AddManualBalanceUpdateTransactionSource1774310400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "source" character varying NOT NULL DEFAULT 'STANDARD'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_manual_balance_update_per_account_date" ON "transaction_entity" ("accountId", "date") WHERE "source" = 'MANUAL_BALANCE_UPDATE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_manual_balance_update_per_account_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "source"`,
    );
  }
}
