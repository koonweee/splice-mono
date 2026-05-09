import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserCategoryAuthority1776100000000 implements MigrationInterface {
  name = 'UserCategoryAuthority1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "providerCategoryProvider" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "providerCategoryPrimary" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "providerCategoryDetailed" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "categoryUpdatedAt" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(
      `UPDATE "transaction_entity" "transaction"
       SET
         "providerCategoryProvider" = 'plaid',
         "providerCategoryPrimary" = "category"."primary",
         "providerCategoryDetailed" = "category"."detailed"
       FROM "category_entity" "category"
       WHERE "transaction"."categoryId" = "category"."id"
         AND "category"."source" = 'plaid'`,
    );

    await queryRunner.query(
      `UPDATE "transaction_entity"
       SET
         "categoryId" = NULL,
         "categoryUpdatedAt" = NULL`,
    );
    await queryRunner.query(
      `UPDATE "transaction_entity" "transaction"
       SET
         "categoryId" = "userCategory"."id",
         "categoryUpdatedAt" = "transaction"."userCategoryUpdatedAt"
       FROM "category_entity" "userCategory"
       WHERE "transaction"."userCategoryId" = "userCategory"."id"
         AND "userCategory"."source" = 'user'`,
    );

    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP CONSTRAINT "FK_transaction_user_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "userCategoryUpdatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "userCategoryId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "categoryReviewMethod"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "categoryReviewedAt"`,
    );

    await queryRunner.query(
      `DROP TABLE "category_visibility_preference_entity"`,
    );
    await queryRunner.query(`DROP INDEX "UQ_category_plaid_normalized_pair"`);
    await queryRunner.query(`DROP INDEX "UQ_category_user_normalized_pair"`);
    await queryRunner.query(
      `DELETE FROM "category_entity" WHERE "source" = 'plaid'`,
    );
    await queryRunner.query(
      `WITH ranked_duplicates AS (
         SELECT
           "id",
           ROW_NUMBER() OVER (
             PARTITION BY "userId", "normalizedPrimary", "normalizedDetailed"
             ORDER BY
               CASE WHEN "archivedAt" IS NULL THEN 0 ELSE 1 END,
               "updatedAt" DESC,
               "id"
           ) AS duplicate_rank
         FROM "category_entity"
         WHERE "source" = 'user'
       )
       UPDATE "category_entity" "category"
       SET
         "detailed" = CONCAT("category"."detailed", ' (archived duplicate ', LEFT("category"."id"::text, 8), ')'),
         "normalizedDetailed" = CONCAT("category"."normalizedDetailed", ' archived duplicate ', LEFT("category"."id"::text, 8)),
         "description" = CASE
           WHEN "category"."description" = '' THEN 'Renamed during user category authority migration to preserve an archived duplicate.'
           ELSE CONCAT("category"."description", ' Renamed during user category authority migration to preserve an archived duplicate.')
         END
       FROM ranked_duplicates
       WHERE "category"."id" = ranked_duplicates."id"
         AND ranked_duplicates.duplicate_rank > 1`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_category_user_normalized_pair_all" ON "category_entity" ("userId", "normalizedPrimary", "normalizedDetailed")`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" DROP COLUMN "source"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This rollback restores structure only. Deleted Plaid taxonomy rows,
    // removed review metadata, and overwritten provider category references
    // cannot be reconstructed from the migrated schema.
    await queryRunner.query(
      `ALTER TABLE "category_entity" ADD "source" character varying NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(
      `DROP INDEX "UQ_category_user_normalized_pair_all"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_category_user_normalized_pair" ON "category_entity" ("userId", "normalizedPrimary", "normalizedDetailed") WHERE "source" = 'user' AND "archivedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_category_plaid_normalized_pair" ON "category_entity" ("normalizedPrimary", "normalizedDetailed") WHERE "source" = 'plaid' AND "archivedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "category_visibility_preference_entity" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "categoryId" uuid NOT NULL, "hiddenAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_category_visibility_user_category" UNIQUE ("userId", "categoryId"), CONSTRAINT "PK_category_visibility_preference" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "categoryReviewedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "categoryReviewMethod" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "userCategoryId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD "userCategoryUpdatedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE "transaction_entity"
       SET
         "userCategoryId" = "categoryId",
         "userCategoryUpdatedAt" = "categoryUpdatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" ADD CONSTRAINT "FK_transaction_user_category" FOREIGN KEY ("userCategoryId") REFERENCES "category_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "categoryUpdatedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "providerCategoryDetailed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "providerCategoryPrimary"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transaction_entity" DROP COLUMN "providerCategoryProvider"`,
    );
  }
}
