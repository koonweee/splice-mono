import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionUserCategoryOverride1775301000000
  implements MigrationInterface
{
  name = 'AddTransactionUserCategoryOverride1775301000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "userCategoryId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "userCategoryUpdatedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD CONSTRAINT "FK_transaction_user_category" FOREIGN KEY ("userCategoryId") REFERENCES "category_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP CONSTRAINT "FK_transaction_user_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "userCategoryUpdatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "userCategoryId"`,
    );
  }
}
