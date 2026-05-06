import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionCategoryReview1775600000000
  implements MigrationInterface
{
  name = 'AddTransactionCategoryReview1775600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "categoryReviewedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "categoryReviewMethod" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "categoryReviewMethod"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "categoryReviewedAt"`,
    );
  }
}
