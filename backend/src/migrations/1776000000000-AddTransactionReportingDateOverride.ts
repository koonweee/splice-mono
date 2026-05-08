import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionReportingDateOverride1776000000000
  implements MigrationInterface
{
  name = 'AddTransactionReportingDateOverride1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "reportingDateOverride" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "reportingDateOverride"`,
    );
  }
}
