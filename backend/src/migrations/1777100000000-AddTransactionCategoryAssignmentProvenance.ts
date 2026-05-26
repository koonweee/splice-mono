import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionCategoryAssignmentProvenance1777100000000
  implements MigrationInterface
{
  name = 'AddTransactionCategoryAssignmentProvenance1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "banking_transaction_entity" ADD "categoryAssignmentSource" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "banking_transaction_entity" ADD "categoryAssignmentRuleId" uuid`,
    );
    await queryRunner.query(
      `UPDATE "banking_transaction_entity"
       SET "categoryAssignmentSource" = 'manual'
       WHERE "categoryId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "banking_transaction_entity" DROP COLUMN "categoryAssignmentRuleId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "banking_transaction_entity" DROP COLUMN "categoryAssignmentSource"`,
    );
  }
}
